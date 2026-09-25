import React from 'react';
import floor_image_file from '../img/appartment_floorplan.jpg';
import './Floorplan.css';
import Pin from './BeaconPin';
import Station from '../Satellite/Satellite';

const trajectoryColor = (mac) => {
    let hash = 0;
    for (let index = 0; index < mac.length; index += 1) {
        hash = mac.charCodeAt(index) + ((hash << 5) - hash);
    }
    return `hsl(${Math.abs(hash) % 360} 80% 45%)`;
};

class Floorimage extends React.Component {
    stationPosition = function(p) {
        this.props.onStationPositionChange(p);
    };

    render() {
        let stationIcons;
        let beaconIcons;
        let trajectoryLines;
        // Stations
        let sta = this.props.stations;
        if (Object.keys(this.props.stations).length > 0) {
            stationIcons = Object.keys(sta).map(key =>
                <Station key={key} mac={key} x={sta[key].x} y={sta[key].y} onPositionChange={this.stationPosition.bind(this)} />
            )
        }

        const positionedMacs = Object.keys(this.props.positions).filter(key => this.props.positions[key].position);
        if(positionedMacs.length > 0) {
            beaconIcons = positionedMacs.map(key =>
                <Pin key={key} mac={key} x={this.props.positions[key].position.x} y={this.props.positions[key].position.y} />
            );
        }

        trajectoryLines = Object.keys(this.props.trajectories).map(mac => {
            const points = this.props.trajectories[mac];
            const color = trajectoryColor(mac);
            return (
                <g className="beacon-trajectory" key={mac}>
                    {points.length > 1 && <polyline points={points.map(point => `${point.x},${point.y}`).join(' ')} stroke={color} />}
                    {points.map((point, index) => <circle key={`${point.timestamp}-${index}`} cx={point.x} cy={point.y} r="3" fill={color} />)}
                </g>
            );
        });
        return (
            <svg className="floorplan" viewBox={"0 0 " + this.props.width + " " + this.props.height}
                 width={this.props.width} height={this.props.height}
                 style={{backgroundImage: "url(" + floor_image_file + ")"}}>
                {trajectoryLines}
                {beaconIcons}
                {stationIcons}
            </svg>
        );
    }
}

export default Floorimage;
