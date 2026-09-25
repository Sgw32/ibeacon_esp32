import React, {Component} from 'react';
import { Button, Icon, Label } from 'semantic-ui-react';
import './Settings.css';

const formatTime = (timestamp) => timestamp ? new Date(timestamp).toLocaleTimeString() : 'never';

const formatAge = (timestamp, now) => {
    if (!timestamp) return 'never';
    const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s ago`;
    return `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
};

class SettingsSidemenu extends Component {
    state = {expandedMac: null};

    toggleMac = (mac) => this.setState(state => ({expandedMac: state.expandedMac === mac ? null : mac}));

    renderBeaconDetails(mac) {
        const observations = this.props.observations[mac] || {};
        const calculation = this.props.positions[mac];
        const trajectory = this.props.trajectories[mac] || [];
        const measurements = calculation?.measurements || [];
        const measurementByStation = Object.fromEntries(measurements.map(item => [item.stationMac, item]));

        return (
            <div className="debug-details">
                <dl>
                    <dt>Calculation</dt><dd>{calculation?.status || 'Waiting for data'}</dd>
                    <dt>Position</dt><dd>{calculation?.position ? `${calculation.position.x}, ${calculation.position.y} px` : 'not available'}</dd>
                    <dt>Position updated</dt><dd>{calculation ? `${formatTime(calculation.updatedAt)} (${formatAge(calculation.updatedAt, this.props.clock)})` : 'never'}</dd>
                    <dt>Update trigger</dt><dd>{calculation?.source || '—'}</dd>
                    <dt>Trajectory points</dt><dd>{trajectory.length}</dd>
                    <dt>Tx power</dt><dd>{calculation?.parameters ? `${calculation.parameters.txPower} dBm` : '-69 dBm'}</dd>
                    <dt>Path-loss exponent</dt><dd>{calculation?.parameters?.pathLossExponent ?? 3}</dd>
                    <dt>Scale</dt><dd>{calculation?.parameters ? `${calculation.parameters.pixelsPerMeter.toFixed(2)} px/m` : '—'}</dd>
                </dl>
                <div className="debug-subheading">Station measurements</div>
                {Object.keys(observations).length === 0 && <div className="debug-empty">No observations</div>}
                {Object.keys(observations).map(stationMac => {
                    const observation = observations[stationMac];
                    const measurement = measurementByStation[stationMac];
                    const station = this.props.stations[stationMac];
                    return (
                        <div className={`station-reading ${measurement ? 'selected' : ''}`} key={stationMac}>
                            <strong>{stationMac}</strong>{measurement && <Label size="mini" color="green">used</Label>}
                            <span>RSSI {observation.rssi} dBm</span>
                            <span>Seen {formatTime(observation.timestamp)} ({formatAge(observation.timestamp, this.props.clock)})</span>
                            <span>Station {station ? `${Math.round(station.x)}, ${Math.round(station.y)} px` : 'position unknown'}</span>
                            {measurement && <span>Estimated distance {measurement.distanceMeters.toFixed(2)} m / {measurement.distancePixels.toFixed(1)} px</span>}
                        </div>
                    );
                })}
            </div>
        );
    }

    render() {
        const {expandedMac} = this.state;
        return (
            <div className="debug-panel">
                <h3><Icon name="bug" /> Live debug</h3>
                <div className={`mqtt-status ${this.props.mqttStatus}`}>
                    <span className="status-dot" /> MQTT {this.props.mqttStatus}
                </div>
                {this.props.mqttDetail && <div className="mqtt-detail">{this.props.mqttDetail}</div>}
                <dl className="debug-summary">
                    <dt>Connected at</dt><dd>{formatTime(this.props.connectedAt)}</dd>
                    <dt>Last message</dt><dd>{formatTime(this.props.lastMessageAt)} ({formatAge(this.props.lastMessageAt, this.props.clock)})</dd>
                    <dt>Topic</dt><dd>{this.props.lastTopic || '—'}</dd>
                    <dt>Last station</dt><dd>{this.props.lastStationMac || '—'}</dd>
                    <dt>Messages / events</dt><dd>{this.props.messageCount} / {this.props.eventCount}</dd>
                    <dt>Stations / beacons</dt><dd>{Object.keys(this.props.stations).length} / {this.props.beacons.length}</dd>
                </dl>
                {this.props.lastPayload && (
                    <details className="raw-message">
                        <summary>Last raw message</summary>
                        <pre>{this.props.lastPayload}</pre>
                    </details>
                )}
                <Button compact size="tiny" onClick={this.props.onClearTrajectories} disabled={Object.keys(this.props.trajectories).length === 0}>
                    <Icon name="trash" /> Clear trajectories
                </Button>
                <div className="debug-hint">Click a MAC for calculation details. Drag bullseyes on the map to update receiver-station positions.</div>
                <ul className="all-beacons-list">
                    {this.props.beacons.map(beacon => (
                        <li key={beacon.mac}>
                            <button className="debug-mac" onClick={() => this.toggleMac(beacon.mac)} aria-expanded={expandedMac === beacon.mac}>
                                <span>{beacon.mac}</span>
                                <span>{beacon.rssi} dBm <Icon name={expandedMac === beacon.mac ? 'chevron up' : 'chevron down'} /></span>
                            </button>
                            {expandedMac === beacon.mac && this.renderBeaconDetails(beacon.mac)}
                        </li>
                    ))}
                </ul>
            </div>
        );
    }
}

export default SettingsSidemenu;
