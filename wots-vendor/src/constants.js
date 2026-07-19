'use strict';

const BASE_URL = 'https://dey3fr5ho9vla.cloudfront.net';
const USER_AGENT = 'wots/1.8 (com.wotsinc.ios; build:47; iOS 26.5.2) Alamofire/4.8.2';
const ACCEPT = '*/*';
const ACCEPT_LANGUAGE = 'en;q=1.0, fr-US;q=0.9';
const ACCEPT_ENCODING = 'gzip;q=1.0, compress;q=0.5';

const DEFAULT_HEADERS = Object.freeze({
  'User-Agent': USER_AGENT,
  Accept: ACCEPT,
  'Accept-Language': ACCEPT_LANGUAGE,
  'Accept-Encoding': ACCEPT_ENCODING,
});

module.exports = {
  BASE_URL,
  USER_AGENT,
  ACCEPT,
  ACCEPT_LANGUAGE,
  ACCEPT_ENCODING,
  DEFAULT_HEADERS,
};
