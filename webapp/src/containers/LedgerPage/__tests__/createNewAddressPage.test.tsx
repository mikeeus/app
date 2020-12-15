// @ts-nocheck
import React from 'react';
import CreateNewAddressPage from '../components/LedgerReceivePage/CreateNewAddressLedgerPage';
import { history } from '../../../utils/testUtils/routeComponentProps';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from '../../../app/rootStore';
import { mount } from 'enzyme';

describe('PaymentRequests component', () => {
  it('should check for snapshot', () => {
    const wrapper = mount(
      <Router>
        <Provider store={store}>
          {/* @ts-ignore */}
          <CreateNewAddressPage history={history} />
        </Provider>
      </Router>
    );
    expect(wrapper).toMatchSnapshot();
  });
});
