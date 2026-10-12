import React, {Component} from 'react';
import './App.css';
import 'semantic-ui-css/semantic.min.css';
import MessageStack from './MessageStack/MessageStack.js';
import KnownBeaconsList from './Settings/Settings.js';
import { Sidebar, Container,  Menu, Icon } from 'semantic-ui-react';
import Floorplan from './Floorplan/Floorplan.js';
import { locateWithDebug, lowPass } from './Positioner/PositionCalculator.js';

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
            devices: {},
            filteredBeacons: {},
            sortedBeacons: [],
            knownBeacons: [],
            stations: loadStations(),
            positions: {},
            trajectories: {},
            rssiLpfAlpha: 1,
            positionLpfAlpha: 1,
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
            const devices = metadata.devices || state.devices;
            const stations = this.updateStationMacList(metadata.stationMac, state.stations);
            const filteredBeacons = this.filterRssiReadings(beaconList, state.filteredBeacons, metadata, state.rssiLpfAlpha);
            const calculated = this.calculatePositions(
                filteredBeacons,
                stations,
                state.trajectories,
                state.positions,
                metadata.receivedAt,
                'MQTT message',
                state.positionLpfAlpha,
                devices
            );
            return {
                beacons: beaconList,
                devices,
                filteredBeacons,
                sortedBeacons: this.beaconMacList(beaconList, devices),
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

    filterRssiReadings = (rawBeacons, previousFiltered, metadata, alpha) => {
        const filtered = Object.fromEntries(
            Object.entries(previousFiltered)
                .filter(([mac]) => rawBeacons[mac])
                .map(([mac, readings]) => [mac, {...readings}])
        );

        metadata.deviceMacs.forEach(mac => {
            const rawReading = rawBeacons[mac]?.[metadata.stationMac];
            if (!rawReading) return;
            const previous = previousFiltered[mac]?.[metadata.stationMac];
            const rssi = previous
                ? lowPass(previous.rssi, rawReading.rssi, alpha)
                : rawReading.rssi;
            filtered[mac] = {
                ...(filtered[mac] || {}),
                [metadata.stationMac]: {...rawReading, rawRssi: rawReading.rssi, rssi}
            };
        });

        return filtered;
    };

    handleMqttStatus = (mqttStatus, mqttDetail = '') => {
        this.setState(state => ({
            mqttStatus,
            mqttDetail: mqttDetail || state.mqttDetail,
            connectedAt: mqttStatus === 'connected' ? Date.now() : state.connectedAt
        }));
    };

    toggleVisibility = () => this.setState({ visible: !this.state.visible });

    beaconMacList = (observations, devices) => {
        if(typeof observations === 'undefined' || Object.keys(observations).length === 0) {
            return [];
        }

        return Object.entries(observations).map(([mac, readings]) => {
            const strongest = Object.values(readings).sort((a, b) => b.rssi - a.rssi)[0];
            return {...(devices[mac] || {}), mac, rssi: strongest.rssi, timestamp: strongest.timestamp};
        }).sort((a, b) => {
            if (a.kind === 'healthband' && b.kind !== 'healthband') return -1;
            if (b.kind === 'healthband' && a.kind !== 'healthband') return 1;
            return b.rssi - a.rssi;
        });
    };

    updateStationMacList = (stationMac, currentStations) => {
        const stations = {...currentStations};
        if (stationMac && typeof stations[stationMac] === 'undefined') {
            stations[stationMac] = {
                x:Math.floor((Math.random() * 500) + 1),
                y:Math.floor((Math.random() * 300) + 1)
            };
        }
        return stations;
    };

    updateDimensions = () => this.setState({height: window.innerHeight, width: window.innerWidth});

    updateClock = () => this.setState(state => {
        const clock = Date.now();
        const positions = {...state.positions};
        const pixelsPerMeter = state.width / state.widthMeters;
        Object.keys(state.filteredBeacons).forEach(mac => {
            if (!positions[mac]?.position) return;
            const freshness = locateWithDebug(state.filteredBeacons[mac], state.stations, pixelsPerMeter, {
                now: clock,
                txPower: state.devices[mac]?.txPower
            });
            if (!freshness.position) {
                positions[mac] = {
                    ...positions[mac],
                    ...freshness,
                    rawPosition: null,
                    position: null,
                    updatedAt: clock,
                    source: 'Observation freshness timeout'
                };
            }
        });
        return {clock, positions};
    });

    updateStationPosition = ({mac, x, y}) => {
        this.setState(state => {
            const stations = {...state.stations, [mac]: {x, y}};
            localStorage.setItem('stations', JSON.stringify(stations));
            const calculated = this.calculatePositions(
                state.filteredBeacons,
                stations,
                state.trajectories,
                state.positions,
                Date.now(),
                `Station ${mac} moved`,
                state.positionLpfAlpha,
                state.devices
            );
            return {stations, positions: calculated.positions, trajectories: calculated.trajectories};
        });
    };

    calculatePositions = (beacons, stations, existingTrajectories, previousPositions, updatedAt, source, positionAlpha, devices) => {
        const positions = {};
        const trajectories = {...existingTrajectories};
        const pixelsPerMeter = this.state ? this.state.width / this.state.widthMeters : window.innerWidth / 8.5;

        Object.keys(beacons).forEach(mac => {
            const result = locateWithDebug(beacons[mac], stations, pixelsPerMeter, {
                now: updatedAt,
                txPower: devices[mac]?.txPower
            });
            const rawPosition = result.position;
            const previousPosition = previousPositions[mac]?.position;
            const position = rawPosition && previousPosition ? {
                x: lowPass(previousPosition.x, rawPosition.x, positionAlpha),
                y: lowPass(previousPosition.y, rawPosition.y, positionAlpha)
            } : rawPosition;
            positions[mac] = {...result, rawPosition, position, updatedAt, source};
            if (position) {
                const points = trajectories[mac] ? [...trajectories[mac]] : [];
                const last = points[points.length - 1];
                if (!last || Math.abs(last.x - position.x) >= 0.1 || Math.abs(last.y - position.y) >= 0.1) {
                    points.push({...position, timestamp: updatedAt});
                }
                trajectories[mac] = points;
            }
        });

        return {positions, trajectories};
    };

    clearTrajectories = () => this.setState({trajectories: {}});

    resetFilters = () => this.setState(state => {
        const filteredBeacons = Object.fromEntries(Object.entries(state.beacons).map(([mac, readings]) => [
            mac,
            Object.fromEntries(Object.entries(readings).map(([stationMac, reading]) => [
                stationMac,
                {...reading, rawRssi: reading.rssi}
            ]))
        ]));
        const calculated = this.calculatePositions(
            filteredBeacons,
            state.stations,
            {},
            {},
            Date.now(),
            'LPF reset',
            state.positionLpfAlpha,
            state.devices
        );
        return {filteredBeacons, positions: calculated.positions};
    });

    setRssiLpfAlpha = (alpha) => this.setState({rssiLpfAlpha: alpha}, this.resetFilters);
    setPositionLpfAlpha = (alpha) => this.setState({positionLpfAlpha: alpha}, this.resetFilters);

    componentDidMount() {
        this.messageStack = new MessageStack(this.receiver, this.handleMqttStatus);
        window.addEventListener('resize', this.updateDimensions);
        this.clockTimer = window.setInterval(this.updateClock, 1000);
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
                                devices={this.state.devices}
                                observations={this.state.beacons}
                                filteredObservations={this.state.filteredBeacons}
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
                                rssiLpfAlpha={this.state.rssiLpfAlpha}
                                positionLpfAlpha={this.state.positionLpfAlpha}
                                clock={this.state.clock}
                                onClearTrajectories={this.clearTrajectories}
                                onResetFilters={this.resetFilters}
                                onRssiLpfAlphaChange={this.setRssiLpfAlpha}
                                onPositionLpfAlphaChange={this.setPositionLpfAlpha}
                            />
                        </Menu.Item>
                    </Sidebar>
                    <Sidebar.Pusher>
                        <Container style={{width:this.state.width+'px',height:this.state.height+'px'}} fluid>
                            <Floorplan positions={this.state.positions} trajectories={this.state.trajectories} devices={this.state.devices} stations={this.state.stations} height={this.state.height} width={this.state.width} onStationPositionChange={this.updateStationPosition} />
                            <Icon style={{position:'absolute'}} onClick={this.toggleVisibility} className={'menubutton'} name='sidebar' size='large' />
                        </Container>
                    </Sidebar.Pusher>
                </Sidebar.Pushable>
            </div>
        );
    }
}

export default App;
