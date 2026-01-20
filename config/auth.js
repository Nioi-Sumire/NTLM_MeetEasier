require('dotenv').config();

module.exports = {
  exchange: {
    username: process.env.EXCHANGE_USER,
    password: process.env.EXCHANGE_PASS,
    domain: process.env.EXCHANGE_DOMAIN,
    uri: process.env.EXCHANGE_URL,
    maildomain: process.env.EXCHANGE_MAIL_DOMAIN
  }
};
