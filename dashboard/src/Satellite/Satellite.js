import React, {Component} from 'react';
import Bullseye from '../SVGIconComponents/BullsEye';

import './Satellite.css';

class Satellite extends Component {
    state = {
        x: this.props.x,
        y: this.props.y,
        mac: this.props.mac
    };

    handleMouseDown = (e) => {
        e.preventDefault();
        this.coords = {
            x: e.pageX,
            y: e.pageY
        };
        document.addEventListener('mousemove', this.handleMouseMove);
        document.addEventListener('mouseup', this.handleMouseUp);
    };

    handleMouseUp = () => {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
        if (!this.coords) {
            return;
        }
        this.coords = {};
        this.props.onPositionChange({x: this.state.x, y: this.state.y, mac: this.props.mac});
    };

    componentDidUpdate(previousProps) {
        if (previousProps.x !== this.props.x || previousProps.y !== this.props.y) {
            this.setState({x: this.props.x, y: this.props.y});
        }
    }

    componentWillUnmount() {
        document.removeEventListener('mousemove', this.handleMouseMove);
        document.removeEventListener('mouseup', this.handleMouseUp);
    }

    handleMouseMove = (e) => {
        const xDiff = this.coords.x - e.pageX;
        const yDiff = this.coords.y - e.pageY;

        this.coords.x = e.pageX;
        this.coords.y = e.pageY;

        this.setState({
            x: this.state.x - xDiff,
            y: this.state.y - yDiff
        });
    };

    render() {
        const {x, y, mac} = this.state;
        return (
            <svg className="satellite-icon"
                width="110px"
                height="30px"
                x={x}
                y={y}
                onMouseDown={this.handleMouseDown}>
                <Bullseye />
                <text x="0" y="30px">{mac.toUpperCase()}</text>
            </svg>
        )
    }
}

export default Satellite;
