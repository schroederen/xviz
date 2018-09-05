// Copyright (c) 2019 Uber Technologies, Inc.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* eslint no-console: off */
/* eslint-env node, browser */

import * as path from 'path';
import * as walk from 'walk';
import * as fs from 'fs';

// See: https://github.com/epoberezkin/ajv/issues/687
const Ajv = require('ajv');

export function validateExampleFiles(schemaDir, examplesDir) {
  const validator = new Ajv();

  let valid = loadAllSchemas(validator, schemaDir);

  valid = valid & validateFiles(validator, examplesDir, true);

  return valid;
}

export function validateInvalidFiles(schemaDir, invalidDir) {
  const validator = new Ajv();

  let valid = loadAllSchemas(validator, schemaDir);

  valid = valid & validateFiles(validator, invalidDir, false);

  return valid;
}

function loadAllSchemas(validator, schemaDir) {
  let valid = true;
  const schemaOptions = {
    listeners: {
      file(fpath, stat, next) {
        if (stat.name.endsWith('.schema.json')) {
          // Build the path to the matching schema
          const fullPath = path.join(fpath, stat.name);
          const relPath = path.relative(schemaDir, fullPath);

          try {
            loadSchema(validator, schemaDir, relPath);
          } catch (e) {
            console.log(`${fullPath}:0: error loading ${e}`);
            valid = false;
          }
        }
        next();
      }
    }
  };

  walk.walkSync(schemaDir, schemaOptions);

  return valid;
}

function loadSchema(validator, schemaDir, relativePath) {
  // Load the Schema
  const schemaPath = path.join(schemaDir, relativePath);

  console.log(`Load: ${relativePath}`);

  let schema;
  try {
    const schemaContents = fs.readFileSync(schemaPath);

    schema = JSON.parse(schemaContents);
  } catch (e) {
    throw new Error(`Error parsing: ${schemaPath} ${e}`);
  }

  validator.addSchema(schema, relativePath);
}

function validateFiles(validator, examplesDir, expectGood) {
  let valid = true;
  const options = {
    listeners: {
      file(fpath, stat, next) {
        if (!stat.name.endsWith('~')) {
          // Build the path to the matching schema
          const examplePath = path.join(fpath, stat.name);
          try {
            valid = valid & validateFile(validator, examplesDir, examplePath, expectGood);
          } catch (e) {
            console.log(`${examplePath}:0: error validating: ${e}`);
            valid = false;
          }
        }
        next();
      }
    }
  };

  walk.walkSync(examplesDir, options);

  return valid;
}

function validateFile(validator, examplesDir, examplePath, expectGood) {
  const exampleRelPath = path.relative(examplesDir, examplePath);
  let schemaRelPath = exampleRelPath.replace('.json', '.schema.json');

  // Load the JSON to validate
  const contents = fs.readFileSync(examplePath);
  let data;
  try {
    data = JSON.parse(contents);
  } catch (e) {
    throw new Error(`Error parsing: examplePath} ${e}`);
  }

  // Lookup the schema and validate
  // Lets see if we in a schema directory instead
  const directorySchema = `${path.dirname(exampleRelPath)}.schema.json`;
  let validate = validator.getSchema(directorySchema);

  if (validate === undefined) {
    validate = validator.getSchema(schemaRelPath);
  } else {
    schemaRelPath = directorySchema;
  }

  if (validate === undefined) {
    console.log(`While checking: ${examplePath}, failed to load: ${schemaRelPath}`);
    return false;
  }

  const valid = validate(data);

  if (expectGood) {
    if (!valid) {
      console.log(`Schema: ${schemaRelPath}`);
      console.log(`${examplePath}:0: failed to validate`);
      console.log(validate.errors);
    } else {
      console.log(`Pass: ${examplePath}`);
    }

    return valid;
  }

  // expectGood == false
  if (valid) {
    console.log(`Schema: ${schemaRelPath}`);
    console.log(`${examplePath}:0: validated when it should not have`);
  } else {
    console.log(`Pass: ${examplePath}`);
  }
  return !valid;
}