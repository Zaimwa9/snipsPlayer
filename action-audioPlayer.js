const player = require('play-sound')(opts = {});
const path = require('path');
const fs = require('fs');
const mqtt = require('mqtt');
const HOST = 'localhost';
const _ = require('lodash');
var client = mqtt.connect('mqtt://' + HOST, {port: 1883});

var LISTED_TRACKS = [];
const musicDir = '/home/pi/music/';

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

client.on('message', function (topic, message) {
	var payload = JSON.parse(message);
	
	if (topic == 'hermes/intent/wzaim:discovery') {
		var answer = '';
		var tracks = browseDir(musicDir, payload);
		_.forEach(tracks, function (track, key) {
			tracks[key] = track.replace('.mp3', '');
		})
		for (var i = 0; (i < 3 && i < tracks.length); i++) {
			answer += tracks[i] + ', ';
			LISTED_TRACKS.push(tracks[i]);
		}
		var resp = {
			'sessionId': payload.sessionId,
			'text': 'Je peux te proposer: ' + answer + '. En veux tu plus ?',
			'intentFilter': ['wzaim:askForMore']
		}
		client.publish('hermes/dialogueManager/continueSession', JSON.stringify(resp));
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
				'text': 'Je peux te proposer: ' + answer + '. En veux tu plus ?',
				'intentFilter': ['wzaim:askForMore']
			}
			client.publish('hermes/dialogueManager/continueSession', JSON.stringify(resp));
		} else {
			var resp = {
				'sessionId': payload.sessionId,
				'text': "Il n'y a pas d'autres track disponible, as-tu fais ton choix ?"
			}
			client.publish('hermes/dialogueManager/endSession', JSON.stringify(resp));
		}
		
	}
})
