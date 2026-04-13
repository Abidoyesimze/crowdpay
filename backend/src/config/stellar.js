const { Horizon, Networks, Asset } = require('@stellar/stellar-sdk');

const isTestnet = process.env.STELLAR_NETWORK !== 'mainnet';

const server = new Horizon.Server(
  process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org'
);

const networkPassphrase = isTestnet ? Networks.TESTNET : Networks.PUBLIC;

// USDC asset — issuer differs between testnet and mainnet
const USDC = new Asset('USDC', process.env.USDC_ISSUER);

module.exports = { server, networkPassphrase, USDC, isTestnet };
