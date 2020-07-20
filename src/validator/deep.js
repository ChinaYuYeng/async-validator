import Schema from '../index';
import rules from '../rule/index.js';
import { isEmptyValue } from '../util';

/**
 *  validate deep directly
 *
 *  @param rule The validation rule.
 *  @param value The value of the field on the source object.
 *  @param callback The callback function.
 *  @param source The source object being validated.
 *  @param options The validation options.
 *  @param options.messages The validation messages.
 */
function deep(rule, value, callback, source, options) {
  let errors = [];
  const validate =
    rule.required || (!rule.required && source.hasOwnProperty(rule.field));
  if (validate) {
    if (isEmptyValue(value, typeof value) && !rule.required) {
      return callback(errors);
    }
    rules.required(rule, value, source, errors, options, typeof value);
    if (
      typeof rule.fields === 'object' ||
      typeof rule.defaultField === 'object'
    ) {
      let fieldsSchema = {};
      if (rule.defaultField) {
        for (const k in value) {
          if (value.hasOwnProperty(k)) {
            fieldsSchema[k] = rule.defaultField;
          }
        }
      }
      fieldsSchema = {
        ...fieldsSchema,
        ...rule.fields,
      };
      for (const f in fieldsSchema) {
        if (fieldsSchema.hasOwnProperty(f)) {
          const fieldSchema = Array.isArray(fieldsSchema[f])
            ? fieldsSchema[f]
            : [fieldsSchema[f]];
          // 某个key下的一套rule，因为深度追加Fullfield全路径属性
          fieldsSchema[f] = fieldSchema.map(s => {
            return {
              ...s,
              fullField: `${rule.fullField}.${f}`,
            };
          });
        }
      }
      const schema = new Schema(fieldsSchema);
      schema.validate(value, options, errs => {
        errs = errs || [];
        callback([...errors, ...errs, ...callback.cache]);
      });
    }
  }
}

export default deep;
