import React, { Component } from 'react';
import PropTypes from 'prop-types';
import * as config from '../../config/flightboard.config.js';

class RoomFilter extends Component {

  constructor(props) {
    super(props);
    this.state = {
      open: false
    };
  }

  openMenu = () => {
    this.setState({ open: true });
  }

  closeMenu = () => {
    this.setState({ open: false });
  }

  toggleMenu = () => {
    this.setState((state) => ({ open: !state.open }));
  }

  filterFlightboard = (e) => {
    this.props.filter(e.currentTarget.id);
    this.closeMenu();
  }

  render() {
    const { error, response, roomlists } = this.props;

    return (
      <li
        className="is-dropdown-submenu-parent opens-right"
        onMouseEnter={this.openMenu}
        onMouseLeave={this.closeMenu}
      >
        <button
          type="button"
          className="current-filter"
          aria-expanded={this.state.open}
          aria-controls="roomlist-filter-options"
          onClick={this.toggleMenu}
        >
          {config.roomFilter.filterTitle}
        </button>
        <ul
          id="roomlist-filter-options"
          className={
            'menu vertical submenu is-dropdown-submenu first-sub fb__child-dropdown'
            + (this.state.open ? ' js-dropdown-active' : '')
          }
        >
          <li onClick={this.filterFlightboard} id="roomlist-all">
            {config.roomFilter.filterAllTitle}
          </li>

          { response && !error ?
            roomlists.map((item, key) =>
              <li onClick={this.filterFlightboard} key={key} id={'roomlist-' + item.toLowerCase().replace(/\s+/g, "-")}>
                {item}
              </li>
            )
          :
            <li id="roomlist__loading">
              Loading ...
            </li>
          }

        </ul>
      </li>
    );
  }
}

RoomFilter.propTypes = {
  filter: PropTypes.oneOfType([
    PropTypes.func,
    PropTypes.string
  ])
};

export default RoomFilter;
