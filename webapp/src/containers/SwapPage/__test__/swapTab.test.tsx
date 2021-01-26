import React from 'react';
import SwapTab from '../components/SwapTab';
import { BrowserRouter as Router } from 'react-router-dom';
import { Provider } from 'react-redux';
import store from '../../../app/rootStore';
import Enzyme from '../../../utils/testUtils/enzyme';
import I18n from 'i18next';

describe('SwapTab component', () => {
  it.skip('should check for snapshot', () => {
    const wrapper = Enzyme.mount(
      <Router>
        <Provider store={store}>
          <SwapTab
            label={I18n.t('containers.swap.swapTab.from')}
            tokenMap={new Map()}
            filterBySymbol={() => ''}
            name={1}
            isLoadingTestPoolSwapTo={false}
            isLoadingTestPoolSwapFrom={false}
            formState={{}}
            handleChangeFrom={() => ''}
            handleChangeTo={() => ''}
            handleDropdown={() => ''}
            setMaxValue={() => ''}
            handleInterchange={() => ''}
            dropdownLabel={I18n.t('components.swapCard.selectAToken')}
          />
        </Provider>
      </Router>
    );
    expect(wrapper).toMatchSnapshot();
  });
});
