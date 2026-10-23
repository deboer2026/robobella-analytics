'use strict';

const fs = require('node:fs');
const path = require('node:path');

const PAGES_PROJECT_NAME = 'robobellaanalytics';
const PAGES_PRODUCTION_DOMAIN = 'robobellaanalytics.pages.dev';
const EXPECTED_GIT_ORIGIN = 'https://github.com/deboer2026/robobella-analytics.git';
const WRANGLER_VERSION = '4.152.0';
const REQUIRED_SITE_ASSETS = [
  'index.html',
  'privacy.html',
  'terms.html',
  'app-icon.png'
];
const VERIFICATION_ASSET_PATTERN = /^tiktok[A-Za-z0-9]+\.txt$/i;

function assertRegularRootFile(root, name) {
  const rootPath = path.resolve(root);
  const filePath = path.resolve(rootPath, name);
  if (path.dirname(filePath) !== rootPath) {
    throw new Error('ASSET_PATH_OUTSIDE_ROOT');
  }
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('ASSET_NOT_REGULAR_FILE');
  }
  return filePath;
}

function listSiteAssets(root) {
  const rootPath = path.resolve(root);
  const names = [...REQUIRED_SITE_ASSETS];
  const verificationFiles = fs.readdirSync(rootPath, {withFileTypes: true})
    .filter((entry) => entry.isFile() && VERIFICATION_ASSET_PATTERN.test(entry.name))
    .map((entry) => entry.name);

  if (verificationFiles.length === 0) {
    throw new Error('VERIFICATION_ASSETS_MISSING');
  }
  names.push(...verificationFiles);

  const uniqueNames = [...new Set(names)].sort();
  for (const name of uniqueNames) assertRegularRootFile(rootPath, name);
  return uniqueNames;
}

function stageSiteAssets(root, outputDirectory) {
  const rootPath = path.resolve(root);
  const outputPath = path.resolve(outputDirectory);
  if (outputPath === rootPath || outputPath.startsWith(rootPath + path.sep)) {
    throw new Error('ASSET_OUTPUT_MUST_BE_OUTSIDE_REPOSITORY');
  }
  if (fs.existsSync(outputPath)) {
    throw new Error('ASSET_OUTPUT_ALREADY_EXISTS');
  }

  const names = listSiteAssets(rootPath);
  fs.mkdirSync(outputPath, {recursive: false});
  try {
    for (const name of names) {
      fs.copyFileSync(assertRegularRootFile(rootPath, name), path.join(outputPath, name));
    }
  } catch (error) {
    fs.rmSync(outputPath, {recursive: true, force: true});
    throw error;
  }

  return {outputDirectory: outputPath, assetCount: names.length, assetNames: names};
}

function projectDomains(row) {
  const value = row && row['Project Domains'];
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== 'string') return [];
  return value.split(',').map((domain) => domain.trim()).filter(Boolean);
}

function validateExistingDirectUploadProject(rows) {
  if (!Array.isArray(rows)) throw new Error('PROJECT_LIST_MALFORMED');
  const matches = rows.filter((row) => row && row['Project Name'] === PAGES_PROJECT_NAME);
  if (matches.length !== 1) throw new Error('EXISTING_PROJECT_NOT_UNIQUE');

  const project = matches[0];
  if (!projectDomains(project).includes(PAGES_PRODUCTION_DOMAIN)) {
    throw new Error('EXISTING_PROJECT_DOMAIN_MISMATCH');
  }
  if (project['Git Provider'] !== 'No') {
    throw new Error('PROJECT_TYPE_CHANGED');
  }
  return {
    projectName: PAGES_PROJECT_NAME,
    productionDomain: PAGES_PRODUCTION_DOMAIN
  };
}

function isExpectedCallbackResponse(response) {
  const headers = response && response.headers;
  const readHeader = (name) => {
    if (headers && typeof headers.get === 'function') return headers.get(name) || '';
    if (headers && typeof headers === 'object') {
      const key = Object.keys(headers).find((candidate) => candidate.toLowerCase() === name);
      return key ? String(headers[key]) : '';
    }
    return '';
  };
  return response?.status === 400 &&
    response?.body === 'Invalid OAuth callback' &&
    /(?:^|,)\s*no-store\s*(?:,|$)/i.test(readHeader('cache-control')) &&
    readHeader('referrer-policy').toLowerCase() === 'no-referrer' &&
    !readHeader('location');
}

module.exports = {
  EXPECTED_GIT_ORIGIN,
  PAGES_PROJECT_NAME,
  PAGES_PRODUCTION_DOMAIN,
  REQUIRED_SITE_ASSETS,
  VERIFICATION_ASSET_PATTERN,
  WRANGLER_VERSION,
  isExpectedCallbackResponse,
  listSiteAssets,
  stageSiteAssets,
  validateExistingDirectUploadProject
};
