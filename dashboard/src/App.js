import React, {Component} from 'react';
import './App.css';
import 'semantic-ui-css/semantic.min.css';
import MessageStack from './MessageStack/MessageStack.js';
import KnownBeaconsList from './Settings/Settings.js';
import { Sidebar, Container,  Menu, Icon } from 'semantic-ui-react';
import Floorplan from './Floorplan/Floorplan.js';
import { locateWithDebug } from './Positioner/PositionCalculator.js';

const loadStations = () => {
    try {
        return JSON.parse(localStorage.getItem('stations') || '{}');
    } catch (error) {
        console.warn('Ignoring invalid saved station positions:', error);
        return {};
    }
};

class App extends Component {

    constructor(props) {
        super(props);
        this.state = {
            beacons: {},
            sortedBeacons: [],
            knownBeacons: [],
            stations: loadStations(),
            positions: {},
            trajectories: {},
            mqttStatus: 'initializing',
            mqttDetail: '',
            connectedAt: null,
            lastMessageAt: null,
            lastTopic: '',
            lastPayload: '',
            lastStationMac: '',
            messageCount: 0,
            eventCount: 0,
            clock: Date.now(),
            visible: false,
            width: window.innerWidth,
            height: window.innerHeight,
            widthMeters: 8.5
        };
    }

    receiver = (beaconList, metadata) => {
        this.setState(state => {
            const stations = this.updateStationMacList(beaconList, state.stations);
            const calculated = this.calculatePositions(
                beaconList,
                stations,
                state.trajectories,
                metadata.receivedAt,
                'MQTT message'
            );
            return {
                beacons: beaconList,
                sortedBeacons: this.beaconMacList(beaconList),
                stations,
                positions: calculated.positions,
                trajectories: calculated.trajectories,
                lastMessageAt: metadata.receivedAt,
                lastTopic: metadata.topic,
                lastPayload: metadata.payload,
                lastStationMac: metadata.stationMac,
                messageCount: state.messageCount + 1,
                eventCount: state.eventCount + metadata.eventCount
            };
        });
    };

    handleMqttStatus = (mqttStatus, mqttDetail = '') => {
        this.setState(state => ({
            mqttStatus,
            mqttDetail: mqttDetail || state.mqttDetail,
            connectedAt: mqttStatus === 'connected' ? Date.now() : state.connectedAt
        }));
    };

    toggleVisibility = () => this.setState({ visible: !this.state.visible });

    beaconMacList = (b) => {
        const objectList = {};
        if(typeof b === 'undefined' || Object.keys(b).length === 0) {
            return [];
        }

        for (let beacon in b) {
            for (let mac in b[beacon]) {
                if(typeof objectList[mac] !== 'undefined'){
                    if(objectList[mac].rssi < b[beacon][mac].rssi) {
                        objectList[mac] = b[beacon][mac];
                    }
                } else {
                    objectList[mac] = b[beacon][mac];
                }
            }
        }

        return Object.keys(objectList).map(beacon => ({
            mac: beacon,
            rssi: objectList[beacon].rssi,
            timestamp: objectList[beacon].timestamp
        })).sort(function(a, b) {
            return a.rssi - b.rssi;
        }).reverse();
    };

    updateStationMacList = (b, currentStations) => {
        if(typeof b === 'undefined' || Object.keys(b).length === 0) {
            return currentStations;
        }

        const stations = {...currentStations};
        for (let beacon in b) {
            for (let station in b[beacon]) {
                if(typeof stations[station] === 'undefined') {
                    stations[station] = {
                        x:Math.floor((Math.random() * 500) + 1),
                        y:Math.floor((Math.random() * 300) + 1)
                    };
                }
            }
        }
        return stations;
    };

    updateDimensions = () => this.setState({height: window.innerHeight, width: window.innerWidth});

    updateStationPosition = ({mac, x, y}) => {
        this.setState(state => {
            const stations = {...state.stations, [mac]: {x, y}};
            localStorage.setItem('stations', JSON.stringify(stations));
            const calculated = this.calculatePositions(
                state.beacons,
                stations,
                state.trajectories,
                Date.now(),
                `Station ${mac} moved`
            );
            return {stations, positions: calculated.positions, trajectories: calculated.trajectories};
        });
    };

    calculatePositions = (beacons, stations, existingTrajectories, updatedAt, source) => {
        const positions = {};
        const trajectories = {...existingTrajectories};
        const pixelsPerMeter = this.state ? this.state.width / this.state.widthMeters : window.innerWidth / 8.5;

        Object.keys(beacons).forEach(mac => {
            const result = locateWithDebug(beacons[mac], stations, pixelsPerMeter);
            positions[mac] = {...result, updatedAt, source};
            if (result.position) {
                const points = trajectories[mac] ? [...trajectories[mac]] : [];
                const last = points[points.length - 1];
                if (!last || last.x !== result.position.x || last.y !== result.position.y) {
                    points.push({...result.position, timestamp: updatedAt});
                }
                trajectories[mac] = points;
            }
        });

        return {positions, trajectories};
    };

    clearTrajectories = () => this.setState({trajectories: {}});

    componentDidMount() {
        this.messageStack = new MessageStack(this.receiver, this.handleMqttStatus);
        window.addEventListener('resize', this.updateDimensions);
        this.clockTimer = window.setInterval(() => this.setState({clock: Date.now()}), 1000);
    }

    componentWillUnmount() {
        window.removeEventListener('resize', this.updateDimensions);
        window.clearInterval(this.clockTimer);
        this.messageStack?.close();
    }

    render() {
        const { visible } = this.state;
        return (
            <div className="App">
                <Sidebar.Pushable as={Container} style={{width:this.state.width+'px',height:this.state.height+'px'}} fluid>
                    <Sidebar as={Menu} animation='slide out' visible={visible} icon='labeled' vertical inverted width='wide'>
                        <Menu.Item name='beacons'>
                            <KnownBeaconsList
                                beacons={this.state.sortedBeacons}
                                observations={this.state.beacons}
                                positions={this.state.positions}
                                trajectories={this.state.trajectories}
                                stations={this.state.stations}
                                mqttStatus={this.state.mqttStatus}
                                mqttDetail={this.state.mqttDetail}
                                connectedAt={this.state.connectedAt}
                                lastMessageAt={this.state.lastMessageAt}
                                lastTopic={this.state.lastTopic}
                                lastPayload={this.state.lastPayload}
                                lastStationMac={this.state.lastStationMac}
                                messageCount={this.state.messageCount}
                                eventCount={this.state.eventCount}
                                clock={this.state.clock}
                                onClearTrajectories={this.clearTrajectories}
                            />
                        </Menu.Item>
                    </Sidebar>
                    <Sidebar.Pusher>
                        <Container style={{width:this.state.width+'px',height:this.state.height+'px'}} fluid>
                            <Floorplan positions={this.state.positions} trajectories={this.state.trajectories} stations={this.state.stations} height={this.state.height} width={this.state.width} onStationPositionChange={this.updateStationPosition} />
                            <Icon style={{position:'absolute'}} onClick={this.toggleVisibility} className={'menubutton'} name='sidebar' size='large' />
                        </Container>
                    </Sidebar.Pusher>
                </Sidebar.Pushable>
            </div>
        );
    }
}

export default App;
