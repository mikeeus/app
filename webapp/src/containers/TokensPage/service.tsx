import isEmpty from 'lodash/isEmpty';
import BigNumber from 'bignumber.js';
import { CustomTx } from 'bitcore-lib-dfi';
import RpcClient from '../../utils/rpc-client';
import {
  CUSTOM_TX_LEDGER,
  DEFAULT_DFI_FOR_ACCOUNT_TO_ACCOUNT, DEFAULT_FEE_RATE, DEFAULT_MAXIMUM_AMOUNT, DEFAULT_MAXIMUM_COUNT,
  DFI_SYMBOL, FEE_RATE,
  LIST_TOKEN_PAGE_SIZE, MAXIMUM_AMOUNT, MAXIMUM_COUNT,
  MINIMUM_DFI_AMOUNT_FOR_MASTERNODE,
  MINIMUM_DFI_REQUIRED_FOR_TOKEN_CREATION,
  UNDEFINED_STRING,
} from '../../constants';
import { handleFetchRegularDFI, sleep } from '../WalletPage/service';
import {
  fetchTokenDataWithPagination,
  getAddressAndAmountListForAccount,
  getAddressForSymbol,
  getBalanceForSymbol,
  getSmallerAmount,
  handleAccountToAccountConversion,
  getAddressForSymbolLedger,
  accountToAccountConversionLedger,
} from '@/utils/utility';
import { PaymentRequestLedger } from '@/typings/models';
import { IAddressAndAmount } from '@/utils/interfaces';
import { ipcRendererFunc } from '@/utils/isElectron';
import { construct } from '@/utils/cutxo';
import PersistentStore from '@/utils/persistentStore';

export const getAddressInfo = (address) => {
  const rpcClient = new RpcClient();
  return rpcClient.getaddressInfo(address);
};

// TODO: Need to remove the dummy data
export const handleFetchToken = async (id: string) => {
  const rpcClient = new RpcClient();
  const tokens = await rpcClient.tokenInfo(id);
  if (isEmpty(tokens)) {
    return {};
  }
  const transformedData = Object.keys(tokens).map(async (item) => {
    const { collateralAddress } = tokens[item];
    let addressInfo;
    if (collateralAddress && collateralAddress !== UNDEFINED_STRING) {
      addressInfo = await getAddressInfo(collateralAddress);
    }

    return {
      ismine: addressInfo && addressInfo.ismine,
      hash: item,
      ...tokens[item],
    };
  });

  return Promise.resolve(transformedData[0]);
};

export const getTransactionInfo = async (txId): Promise<any> => {
  const rpcClient = new RpcClient();
  const txInfo = await rpcClient.getTransaction(txId);
  if (!txInfo.blockhash && txInfo.confirmations === 0) {
    await sleep(3000);
    await getTransactionInfo(txId);
  } else {
    return;
  }
};

export const handleFetchTokens = async () => {
  const rpcClient = new RpcClient();
  return await fetchTokenDataWithPagination(
    0,
    LIST_TOKEN_PAGE_SIZE,
    rpcClient.listTokens
  );
};

export const handleTokenTransfers = async (id: string) => {
  return [];
};

export const createTokenUseWallet = async (tokenData) => {
  let accountToAccountAmount = new BigNumber(0);
  const rpcClient = new RpcClient();
  const regularDFI = await handleFetchRegularDFI();
  const list = await getAddressAndAmountListForAccount();
  const { address, amount: maxAmount } = await getAddressForSymbol(
    DFI_SYMBOL,
    list
  );
  if (regularDFI < MINIMUM_DFI_REQUIRED_FOR_TOKEN_CREATION) {
    if (
      Number(MINIMUM_DFI_REQUIRED_FOR_TOKEN_CREATION) >
      maxAmount + regularDFI
    ) {
      accountToAccountAmount = await handleAccountToAccountConversion(
        list,
        address,
        DFI_SYMBOL
      );
    }
    const txId = await rpcClient.sendToAddress(
      address,
      DEFAULT_DFI_FOR_ACCOUNT_TO_ACCOUNT
    );
    await getTransactionInfo(txId);
    const balance = await getBalanceForSymbol(address, DFI_SYMBOL);
    const finalBalance = getSmallerAmount(
      balance,
      accountToAccountAmount.plus(maxAmount).toFixed(8)
    );
    const hash = await rpcClient.accountToUtxos(
      address,
      address,
      `${finalBalance.toFixed(8)}@DFI`
    );
    await getTransactionInfo(hash);
  }

  const hash = await rpcClient.createToken(tokenData);
  return {
    hash,
  };
}

export const createTokenUseLedger = async (tokenData, paymentsLedger: PaymentRequestLedger[]) => {
  const rpcClient = new RpcClient();
  let accountToAccountAmount = new BigNumber(0);
  const cutxo = await construct({
    maximumAmount:
      PersistentStore.get(MAXIMUM_AMOUNT) || DEFAULT_MAXIMUM_AMOUNT,
    maximumCount: PersistentStore.get(MAXIMUM_COUNT) || DEFAULT_MAXIMUM_COUNT,
    feeRate: PersistentStore.get(FEE_RATE) || DEFAULT_FEE_RATE,
  });

  const { address,  maxAmount } = await getAddressForSymbolLedger(
    DFI_SYMBOL,
    paymentsLedger,
  );

  if (Number(MINIMUM_DFI_REQUIRED_FOR_TOKEN_CREATION) > maxAmount) {
    accountToAccountAmount = await accountToAccountConversionLedger(
      paymentsLedger,
      address,
      DFI_SYMBOL
    );
    const txId = await rpcClient.sendToAddress(
      address,
      DEFAULT_DFI_FOR_ACCOUNT_TO_ACCOUNT
    );
    const balance = await getBalanceForSymbol(address, DFI_SYMBOL);
    const finalBalance = getSmallerAmount(
      balance,
      accountToAccountAmount.plus(maxAmount).toFixed(8)
    );
    const ipcRenderer = ipcRendererFunc();
    const dataAccountToUtxos = {
      txType: CustomTx.customTxType.accountToUtxos,
      customData: {
        from: address,
        balances: [{ balance: finalBalance, token: DFI_SYMBOL}],
        mintingOutputsStart: 0,
      },
    };
    const keyIndex = paymentsLedger.find((payment) => payment.address === address)?.keyIndex;
    const resAccountToUtxos = await ipcRenderer.sendSync(
      CUSTOM_TX_LEDGER,
      cutxo,
      address,
      finalBalance,
      dataAccountToUtxos,
      keyIndex
    );
    if (resAccountToUtxos.success) {
      await rpcClient.sendRawTransaction(resAccountToUtxos.data.tx);
      return resAccountToUtxos.data.tx;
    } else {
      throw new Error(resAccountToUtxos.message);
    }
    const dataCreateToken = {
      txType: CustomTx.customTxType.createToken,
      customData: tokenData,
    };
    const resCreateToken = await ipcRenderer.sendSync(
      CUSTOM_TX_LEDGER,
      cutxo,
      address,
      finalBalance,
      dataCreateToken,
      keyIndex
    );
    if (resCreateToken.success) {
      return await rpcClient.sendRawTransaction(resCreateToken.data.tx);
    } else {
      throw new Error(resCreateToken.message);
    }
  }
  return null;
}

export const handleCreateTokens = async (
  tokenData,
  typeWallet: string|null,
  paymentsLedger: PaymentRequestLedger[],
) => {
  const data = {
    name: tokenData.name,
    symbol: tokenData.symbol,
    isDAT: tokenData.isDAT,
    decimal: Number(tokenData.decimal),
    limit: Number(tokenData.limit),
    mintable: JSON.parse(tokenData.mintable),
    tradeable: JSON.parse(tokenData.tradeable),
    collateralAddress: tokenData.collateralAddress,
  };
  if (!tokenData.name) {
    delete data.name;
  }
  if (typeWallet === 'ledger') {
    return await createTokenUseLedger(data, paymentsLedger);
  }
  return await createTokenUseWallet(data);
};

export const handleMintTokens = async (tokenData) => {
  const { address } = tokenData;
  const rpcClient = new RpcClient();
  const txId = await rpcClient.sendToAddress(
    address,
    DEFAULT_DFI_FOR_ACCOUNT_TO_ACCOUNT,
    true
  );
  await getTransactionInfo(txId);
  const hash = await rpcClient.mintToken(tokenData);
  return {
    hash,
  };
};

export const handleUpdateTokens = async (tokenData) => {
  const data = {
    name: tokenData.name,
    token: tokenData.symbol,
    isDAT: tokenData.isDAT,
    decimal: Number(tokenData.decimal),
    limit: Number(tokenData.limit),
    mintable: JSON.parse(tokenData.mintable),
    tradeable: JSON.parse(tokenData.tradeable),
  };
  if (!tokenData.name) {
    delete data.name;
  }
  const rpcClient = new RpcClient();
  const hash = await rpcClient.updateToken(data);
  return {
    hash,
  };
};

export const handleDestroyToken = (tokenId) => {
  const rpcClient = new RpcClient();
  return rpcClient.destroyToken(tokenId);
};

export const getReceivingAddressAndAmountList = async () => {
  const rpcClient = new RpcClient();
  const addressAndAmountList = await rpcClient.getReceivingAddressAndTotalAmountList();
  return {
    addressAndAmountList,
  };
};

export const getReceivingAddressAndAmountListLedger = async (
  payments: PaymentRequestLedger[]
) => {
  const rpcClient = new RpcClient();
  const receivedPromisses = payments.map(({ address }) => {
    // return new Promise(resolve => resolve(5))
    return rpcClient.getReceivedByAddress(address);
  });
  const amounts = await Promise.all(receivedPromisses);
  return {
    addressAndAmountList: payments.map(({ address }, index) => ({
      address,
      amount: amounts[index],
    })),
  };
};
