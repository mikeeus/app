import { call, put, takeLatest, select, all } from 'redux-saga/effects';
import * as log from '../../utils/electronLogger';
import cloneDeep from 'lodash/cloneDeep';
import isEmpty from 'lodash/isEmpty';
import { shutDownBinary } from '../../worker/queue';
import { I18n } from 'react-redux-i18n';
import {
  fetchMasternodesRequest,
  fetchMasternodesSuccess,
  fetchMasternodesFailure,
  createMasterNode,
  createMasterNodeFailure,
  createMasterNodeSuccess,
  resignMasterNode,
  resignMasterNodeFailure,
  resignMasterNodeSuccess,
  startRestartNodeWithMasterNode,
  finishRestartNodeWithMasterNode,
} from './reducer';
import { restartModal } from '../PopOver/reducer';
import {
  handelFetchMasterNodes,
  handelCreateMasterNodes,
  handleResignMasterNode,
  getAddressInfo,
} from './service';

import { getErrorMessage, getNetwork } from '../../utils/utility';

import { restartNode, isElectron } from '../../utils/isElectron';
import { RESIGNED_STATE } from '../../constants';
import { TypeWallet } from '@/typings/entities';

export function* getConfigurationDetails() {
  const { configurationData } = yield select((state) => state.app);
  const data = cloneDeep(configurationData);
  if (isEmpty(data)) {
    throw new Error('Unable to fetch configuration file');
  }
  return data;
}

export function* fetchMasterNodes() {
  try {
    const data = yield call(handelFetchMasterNodes);
    const enabledMasternode = data.filter(
      (masterNode) => masterNode.state !== RESIGNED_STATE
    );
    const masternodes: any[] = [];
    for (const iterator of enabledMasternode) {
      try {
        const result = yield call(MasterNodeOwnerInfo, iterator);
        masternodes.push(result);
      } catch (err) {
        log.error(err.message);
      }
    }
    yield put({
      type: fetchMasternodesSuccess.type,
      payload: { masternodes },
    });
  } catch (e) {
    yield put({
      type: fetchMasternodesFailure.type,
      payload: getErrorMessage(e),
    });
    log.error(e);
  }
}

export function* createMasterNodes({ payload }: { payload: TypeWallet }) {
  try {
    const networkName = yield call(getNetwork)
    const data = yield call(handelCreateMasterNodes, payload, networkName);
    yield put({ type: createMasterNodeSuccess.type, payload: { ...data } });
  } catch (e) {
    yield put({
      type: createMasterNodeFailure.type,
      payload: getErrorMessage(e),
    });
    log.error(e);
  }
}

export function* masterNodeResign(action) {
  try {
    const {
      payload: { masterNodeHash },
    } = action;
    const data = yield call(handleResignMasterNode, masterNodeHash);
    yield put({ type: resignMasterNodeSuccess.type, payload: data });
  } catch (e) {
    yield put({
      type: resignMasterNodeFailure.type,
      payload: getErrorMessage(e),
    });
    log.error(e);
  }
}

export function* handleRestartNode() {
  const {
    createdMasterNodeData: { masternodeOperator, masternodeOwner },
  } = yield select((state) => state.masterNodes);
  try {
    if (isElectron()) {
      const data = yield call(getAddressInfo, masternodeOwner);
      if (data.ismine && !data.iswatchonly) {
        const updatedConf = yield call(getConfigurationDetails);
        updatedConf.masternode_operator = masternodeOperator;
        updatedConf.masternode_owner = masternodeOwner;
        yield put(restartModal());
        yield call(shutDownBinary);
        yield call(restartNode, { updatedConf });
        yield put(finishRestartNodeWithMasterNode());
      } else
        throw new Error(
          I18n.t('alerts.addressIsNotAPartOfWallet', {
            addressName: 'masternodeOperator',
          })
        );
    } else throw new Error(I18n.t('alerts.electronRequiredError'));
  } catch (e) {
    yield put({
      type: createMasterNodeFailure.type,
      payload: getErrorMessage(e),
    });
    log.error(e);
  }
}

function* MasterNodeOwnerInfo(masterNode: any) {
  const data = yield call(getAddressInfo, masterNode.ownerAuthAddress);
  return {
    ...masterNode,
    isMyMasternode: data.ismine && !data.iswatchonly,
  };
}

function* mySaga() {
  yield takeLatest(fetchMasternodesRequest.type, fetchMasterNodes);
  // @ts-ignore
  yield takeLatest(createMasterNode.type, createMasterNodes);
  yield takeLatest(resignMasterNode.type, masterNodeResign);
  yield takeLatest(startRestartNodeWithMasterNode.type, handleRestartNode);
}

export default mySaga;
