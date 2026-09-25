import mqtt from "mqtt";
import conf from './config';

class MessageContainer {

    constructor(callbackFunc, statusCallback = () => {}) {
        this.callbackFunc = callbackFunc;
        this.statusCallback = statusCallback;
        this.errors = [];
        this.beacons = {};
        this.stations = [];

        // This function keep only one record of each beacon
        this.processMessage = function (topic, message) {
            // message is Buffer
            let payload = message.toString();
            //console.log(payload);
            let msg;
            try {
                msg = JSON.parse(payload);
            } catch (error){
                msg = null;
                console.log(error.message);
            }

            if(msg !== null && Array.isArray(msg.e) && typeof msg.st === 'string') {
                for(let i=0; i<msg.e.length;i++) {
                    let mac = msg.e[i].m.toLowerCase();
                    let station = msg.st.toLowerCase();
                    if(this.stations.includes(station)) {

                    } else {
                        this.stations.push(station);
                    }
                    if(this.stations.includes(mac)) {
                        // Dont measure stations rssi
                        // with other stations.
                    } else {
                        if (typeof this.beacons[mac] !== 'object') {
                            // Initialize
                            this.beacons[mac] = {};
                        } else if (typeof this.beacons[mac][station] === 'object') {
                            // Remove old record
                            delete this.beacons[mac][station];
                        }
                        // Insert new record
                        this.beacons[mac][station] = {
                            rssi: parseInt(msg.e[i].r, 10),
                            timestamp: Date.now()
                        }
                    }
                }
                this.callbackFunc({...this.beacons}, {
                    topic,
                    receivedAt: Date.now(),
                    eventCount: msg.e.length,
                    stationMac: msg.st.toLowerCase(),
                    payload
                });
            } else if (msg !== null) {
                this.statusCallback('error', 'Message does not contain st and e fields');
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
