const Converter = require('api-spec-converter');
const FS = require('fs');
const fetch = require('node-fetch');
var endpoint = `account_notifications`

function convertCanvasEndpoint(endpoint) {
  Converter.convert({
    from: 'swagger_1',
    to: 'swagger_2',
    source: `https://canvas.instructure.com/doc/api/${endpoint}.json`
  }).then(function(converted) {
    // converted.fillMissing();
    
    return converted.validate()
      .then(function (result) {
        //if (result.errors)
        //  return console.error(JSON.stringify(errors, null, 2));
        //if (result.warnings)
        //  return console.error(JSON.stringify(warnings, null, 2));

        FS.writeFileSync(`swagger_endpoints/form_data/${endpoint}.json`, converted.stringify());
      });
  });
}

/**
 * Determines if a given set of parameters have formData.
 * @param {Array} parameters The parameters of a Swagger Doc method.
 * @return {boolean} The boolean result.
 */
function hasFormData(parameters)
{
  var result = false;
  if(parameters != undefined || parameters != null)
    parameters.forEach(function(parameter)
    {
      if(parameter.in === "formData")
        result = true;
    });
  return result;
}

/**
 * Extracts relavent parameters from a given method. 
 * @param {string} path The path where params are located.
 * @param {string} method The method where params are located.
 * @param {JSON} json The Swagger Doc JSON being converted.
 * @returns {Array} Array of JSON objects that represent the parameters of a relavent path.
 * @returns {undefined} Undefined return if path does not have any formData parameters.
 */
function getParameters(path, method, json)
{
  var obj;
  console.log(`${path} ${method}`)
  if(hasFormData(json.paths[path][method].parameters))
  {
    obj = json.paths[path][method]["parameters"];
  }

  return obj;
}

/**
 * Request schema format
 * "post":
 * {
 *  "consumes": "application/json"
 *  "parameters":
 *  {
 *    "in": "body"
 *    "name": "some name" //not required
 *    "description": "some description"
 *    "schema":
 *    {
 *      "type": "object"
 *      "required": ["requiredField"]
 *      "properties":
 *      {
 *        "field1": 
 *        {
 *          "type": "string"
 *        }
 *      }
 *    }
 *  }
 * }
 */

/**
 * @param {Array} parameterArray Array of parameters for a path with formData
 * @returns {Array} Returns an array of converted parameters (path and json)
 */
function convertParamFormToJson(parameterArray)
{
  var parameters = []

  var jsonParam = 
  {
    "in": "body",
    "name": "some name",
    "description": "some description",
    "schema":
    {
      "type": "object",
      "properties": {}
    }
  }

  parameterArray.forEach(function(parameter)
  {
    if(parameter.in === "formData")
    {
      //get the name of the object being modified at this endpoint
      //i.e. account_notifications when the parameter name is account_notification[attribute]
      //this matches the account_notification part of the above example.
      var objectNameMatch = parameter.name.match(/[a-z_A-Z]+(?=\[[a-z_A-Z]+\])/);
      //check if the parameter is of the form object_name[property_name] or just object_name
      if(objectNameMatch != null)
      {
        var objectName = objectNameMatch[0]; //get the object name
        
        // --properties
        // check to see if the properties subfied of the given objectName already exists, if it does not then initialize it
        if(jsonParam.schema.properties[objectName] == undefined || jsonParam.schema.properties[objectName] == null)
        {
          jsonParam.schema.properties[objectName] =
          {
            "properties": {}
          }
        }
        
        var propertyName = parameter.name.match(/(?<=\[)[a-z_A-Z]+(?=\])/)[0];
        
        jsonParam.schema.properties[objectName].properties[propertyName] = 
        {
          "type": parameter["type"]
        };
        // finds the property name matches: property_name in object_name[property_name]

        // --required
        if(parameter["required"])
        {
          // check if the required field has been initialized yet at the object level
          if(jsonParam.schema.required == undefined)
            jsonParam.schema.required = [];
          // check if the object has been added as a required already. Note: this supports multiple objects
          if(jsonParam.schema.required.indexOf(objectName) == -1)
          {
            jsonParam.schema.required.push(objectName);
          }
  
          // check if the required field has been initialized yet at the object property level
          if(jsonParam.schema.properties[objectName].required == undefined)
            jsonParam.schema.properties[objectName].required = []
          //push the object property as a required field
          jsonParam.schema.properties[objectName].required.push(propertyName);
        }

        // --items
        if(parameter.items != undefined || parameter.items != null)
        {
          jsonParam.schema.properties[objectName].properties[propertyName]["items"] = parameter.items;
        }

        // --enum
        if(parameter.enum != undefined || parameter.enum != null)
        {
          jsonParam.schema.properties[objectName].properties[propertyName]["enum"] = parameter.enum;
        }
        
      } else 
      {
        // --properties
        jsonParam.schema.properties[parameter.name] = 
        {
          "type": parameter.type
        };
        // --required
        if(parameter.required)
        {
          if(jsonParam.schema.required == null || jsonParam.schema.required == undefined)
            jsonParam.schema.required = [];
          
          jsonParam.schema.required.push(parameter.name);
        }
        
        // --items
        if(parameter.items != undefined || parameter.items != null)
        {
          jsonParam.schema.properties[parameter.name]["items"] = parameter.items;
        }

        // --enum
        if(parameter.enum != undefined || parameter.enum != null)
        {
          jsonParam.schema.properties[parameter.name]["enum"] = parameter.enum;
        }
      }
    } else if(parameter.in === "path")
    {
      parameters.push(parameter);
    } else
    {
      throw new Error("unhandled parameter type");
    }

  });

  parameters.push(jsonParam);
  return parameters;
}

async function convertFormToJson(swaggerDoc) {
  // cycle through each path and get relavent parse relavent method parameters
  Object.keys(swaggerDoc.paths).forEach(function(path) {
    Object.keys(swaggerDoc.paths[path]).forEach(function(method) {
      // get the parameters for a method that has form data
      var parameters = getParameters(path, method, swaggerDoc);
      if(parameters != undefined || parameters != null)
      {
        swaggerDoc.paths[path][method]["consumes"] = ["application/json"]
        // convert the provided formData params to a JSON param
        var jsonParameters = convertParamFormToJson(parameters);
        // replace the formData params with the new JSON param
        swaggerDoc.paths[path][method].parameters = jsonParameters;
      }
    });
  });
  return swaggerDoc;
}

async function convertFormDataCanvasEndpoint(endpoint) {
  await convertCanvasEndpoint(endpoint);
  
  const file = `./swagger_endpoints/form_data/${endpoint}.json`;
  var itter = 0;
  var swaggerDoc = require(file);
  
  var swaggerDoc = await convertFormToJson(swaggerDoc);
  FS.writeFileSync(`swagger_endpoints/json/${endpoint}.json`, JSON.stringify(swaggerDoc, null, 2));
  return swaggerDoc;
}

// working
// convertCanvasEndpoint(endpoint);
//convertFormDataCanvasEndpoint(endpoint)
convertFormDataCanvasEndpoint(endpoint).then(result => console.log(JSON.stringify(result)));