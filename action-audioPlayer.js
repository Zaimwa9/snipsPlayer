#!/usr/bin/env node

const player = require('play-sound')(opts = {});
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const HOST = 'localhost';
const _ = require('lodash');
const ini = require('ini');
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

var client = mqtt.connect('mqtt://' + HOST, {port: 1883});

var LISTED_TRACKS = [];
var CURRENT_SONG;
var AUDIO_PROCESS;
const musicDir = config.secret.playlistPath.length > 0 ? config.secret.playlistPath : './';

client.on('connect', function () {
	console.log('connected to ' + HOST);
	client.subscribe('hermes/hotword/default/detected');
	client.subscribe('hermes/intent/#');
})

function browseDir(startPath, payload) {
	if (!fs.existsSync(musicDir)) {
		console.log('Error: No directory');
		var resp = {
			'sessionId': payload.sessionId,
			'text': "Le repertoire n'existe pas, revoyez la configuration"
		}
		client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
	}
	
	var tracks = fs.readdirSync(musicDir);
	tracks = _.filter(tracks, (track) => {
		return (track.substr(track.length - 4) == '.mp3');
	})
	return tracks;
}

function checkSong(startPath, trackName, payload) {
	if (!fs.existsSync(musicDir)) {
		console.log('Error: No directory');
		var resp = {
			'sessionId': payload.ssessionId,
			'text': "Attention, il y a un probleme avec ta librairie."
		}
		client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
	}
	var tracks = fs.readdirSync(musicDir);
	var needle = trackName.substr(trackName.length - 4) != '.mp3' ? trackName + '.mp3' : trackName;
	var myTrack = _.filter(tracks, (track) => {
		return track.toLowerCase() == needle.toLowerCase();
	})
	return `./${path.join(startPath, myTrack[0])}`;
}

client.on('message', function (topic, message) {
	var payload = JSON.parse(message);	

	if (topic == 'hermes/intent/wzaim:discovery') {
		var answer = '';
		var tracks = browseDir(musicDir, payload);
		if (tracks.length == 0) {
			var resp = {
				'sessionId': payload.sessionId,
				'text': `Il n'y a aucune chanson disponible dans ta playlist.`
			}
			client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
		} else {
			_.forEach(tracks, function (track, key) {
				tracks[key] = track.replace('.mp3', '');
			})
			for (var i = 0; (i < 3 && i < tracks.length); i++) {	
				var idRand = Math.floor(Math.random() * (tracks.length - 1));
				answer += tracks[idRand] + ', ';
				LISTED_TRACKS.push(tracks[idRand]);
				tracks.splice(idRand, 1);
			}
			var resp = {
				'sessionId': payload.sessionId,
				'text': `Je peux te proposer: ${answer}. Dois-je continuer ou as tu choisi ?`,
				'intentFilter': ['wzaim:askForMore', 'wzaim:selectTrack', 'wzaim:stopProgram']
			}
			client.publish('hermes/dialogueManager/continueSession', JSON.stringify(resp));
		}
	}

	if (topic == 'hermes/intent/wzaim:askForMore') {
		var answer = '';
		var tracks = browseDir(musicDir, payload);
		
		_.forEach(tracks, function (track, key) {
			tracks[key] = track.replace('.mp3', '');
		})
		tracks = tracks.filter(function (track) {
			return LISTED_TRACKS.indexOf(track) == -1;
		})
		if (tracks.length != 0) {
			for (var i = 0; (i < 3 && i < tracks.length); i++) {
				answer += tracks[i] + ', ';
				LISTED_TRACKS.push(tracks[i]);
			}
			var resp = {
				'sessionId': payload.sessionId,
				'text': `Je peux te proposer: ${answer} . En veux tu plus ?`,
				'intentFilter': ['wzaim:askForMore', 'wzaim:selectTrack', 'wzaim:stopProgram']
			}
			client.publish('hermes/dialogueManager/continueSession', JSON.stringify(resp));
		} else {
			var resp = {
				'sessionId': payload.sessionId,
				'text': "Il n'y a pas d'autres track disponible, que dois-je faire ?"
			}
			client.publish('hermes/dialogueManager/continueSession', JSON.stringify(resp));
		}
	}

	if (topic == 'hermes/intent/wzaim:selectTrack') {
		if (AUDIO_PROCESS) {
			AUDIO_PROCESS.kill();	
		}
		if (payload.slots.length > 0) {
			var song = payload.slots[0].rawValue;
			var selection = checkSong(musicDir, song, payload);
			var temp = selection.split('/');
			
			CURRENT_SONG = temp.length > 0 ? temp[temp.length - 1].replace('.mp3', '') : selection;
			
			AUDIO_PROCESS = player.play(selection, function (err) {
				if (err) {
					console.log('Erreur ' + err);
				}
			});
			var resp = {
				'sessionId': payload.sessionId,
				'text': `Je vais jouer ${song}.`
			}
			client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
		}
	}
	
	if (topic == 'hermes/intent/wzaim:skipTrack') {
		var tracks = browseDir(musicDir, payload);
		tracks = tracks.filter(function (track) {
			return tracks.indexOf(CURRENT_SONG) == -1;
		});
		tracks = tracks.map(function (track) {
			return path.join(musicDir, track);
		})
		if (AUDIO_PROCESS) {
			AUDIO_PROCESS.kill();
		}
		AUDIO_PROCESS = player.play(tracks, {mpg123: ['--random', ]}, function (err) {
			if (err) {
				console.log('Erreur ' + err);
			}
		})
		var resp = {
			'sessionId': payload.sessionId,
			'text': ''
		}
		client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
	}

	if (topic == 'hermes/intent/wzaim:askName') {
		if (!AUDIO_PROCESS) {
			var resp = {
				'sessionId': payload.sessionId,
				'text': `Aucun son en cours.`
			}
			client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
		}
		else {
			var resp = {
				'sessionId': payload.sessionId,
				'text': `Je joue actuellement est ${CURRENT_SONG}`
			}
			client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
		}
	}

	if (topic == 'hermes/intent/wzaim:stopProgram') {
		if (AUDIO_PROCESS) {
			AUDIO_PROCESS.kill();
		}
		var resp = {
			'sessionId': payload.sessionId,
			'text': "Je retourne dormir"
		}
		LISTED_TRACKS = [];
		client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
	}
})
