import mqtt from "mqtt";
import conf from './config';
import { createObservationStore, ingestObservationMessage } from './ObservationStore.js';

class MessageContainer {

    constructor(callbackFunc, statusCallback = () => {}) {
        this.callbackFunc = callbackFunc;
        this.statusCallback = statusCallback;
        this.errors = [];
        this.observationStore = createObservationStore();

        // This function keep only one record of each beacon
        this.processMessage = function (topic, message) {
            // message is Buffer
            let payload = message.toString();
            //console.log(payload);
            try {
                const result = ingestObservationMessage(this.observationStore, payload);
                this.callbackFunc(result.beacons, {
                    ...result.metadata,
                    devices: result.devices,
                    topic,
                    payload
                });
            } catch (error){
                console.log(error.message);
                this.statusCallback('error', error.message);
            }
        };

        /* OPEN WEBSOCKET CONNECTION TO MQTT BROKER */
        const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
        this.statusCallback('connecting', `${protocol}://${conf.host}:${conf.port}`);
        this.client = mqtt.connect(`${protocol}://${conf.host}:${conf.port}`, {
            username: conf.username,
            password: conf.password,
            clientId: 'bledemo_' + Math.random().toString(16).substr(2, 8),
            clean: true
        });
        this.client.on('connect', () => {
            this.statusCallback('connected', `${protocol}://${conf.host}:${conf.port}`);
            this.client.subscribe(conf.channel, error => {
                if (error) {
                    this.statusCallback('error', `Subscription failed: ${error.message}`);
                }
            });
        });
        this.client.on('message', this.processMessage.bind(this));
        this.client.on('reconnect', () => this.statusCallback('reconnecting'));
        this.client.on('offline', () => this.statusCallback('offline'));
        this.client.on('close', () => this.statusCallback('disconnected'));
        this.client.on('error', (error) => {
            this.errors.push(error.message);
            this.statusCallback('error', error.message);
        });
    }

    close() {
        this.client?.end();
    }

}
export default MessageContainer;
