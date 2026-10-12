import React from 'react';
//import StreetView from '../img/street-view.svg';
import StreetView from '../SVGIconComponents/StreetView';
// Beacon icon examples
//import MapMarker from '../img/map-marker.svg';
//import MapPin from '../img/map-pin.svg';
//import Crosshairs from '../img/crosshairs.svg';
//import Bullseye from '../img/bullseye.svg';

import './BeaconPin.css';

class Pin extends React.Component {

    render() {
        const isHealthBand = this.props.device?.kind === 'healthband';
        const label = isHealthBand
            ? `${this.props.device?.name || 'HealthBand'} (${this.props.mac.toUpperCase()})`
            : this.props.device?.name || this.props.mac.toUpperCase();
        let width = this.props.width || 100;
        let height = this.props.height || 40;
        return (
            <svg className={`beacon-icon ${isHealthBand ? 'healthband-icon' : ''}`}
                 id={this.props.mac}
                 viewBox={"0 0 " + width + " " + height}
                 width={width}
                 height={height}
                 x={this.props.x}
                 y={this.props.y}
            >
                <title>{label}</title>
                <StreetView preserveAspectRatio="xMaxYMax meet"/>
                <text x="0" y="40px">{label}</text>
            </svg>
        );
    }
}

export default Pin;
