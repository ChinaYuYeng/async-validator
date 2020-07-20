import {
  format,
  complementError,
  asyncMap,
  warning,
  deepMerge,
  convertFieldsError,
} from './util';
import validators from './validator/index';
import { messages as defaultMessages, newMessages } from './messages';

/**
 *  Encapsulates a validation schema.
 *
 *  @param descriptor An object declaring validation rules
 *  for this schema.
 */
function Schema(descriptor) {
  this.rules = null;
  this._messages = defaultMessages;
  this.define(descriptor);
}

Schema.prototype = {
  // 合并用户输入的验证消息
  messages(messages) {
    if (messages) {
      this._messages = deepMerge(newMessages(), messages);
    }
    return this._messages;
  },
  // 判断，格式化用户输入rules
  // {key:{}} => {key:[{}]}
  define(rules) {
    // 排除null的情况
    if (!rules) {
      throw new Error('Cannot configure a schema with no rules');
    }
    // 必须是object，null也满足这个条件typeof null === object
    if (typeof rules !== 'object' || Array.isArray(rules)) {
      throw new Error('Rules must be an object');
    }
    this.rules = {};
    let z;
    let item;
    // 全部转换成a:[b]的形式
    for (z in rules) {
      if (rules.hasOwnProperty(z)) {
        item = rules[z];
        this.rules[z] = Array.isArray(item) ? item : [item];
      }
    }
  },
  /**
   * 验证给与的值对象
   * @param {*} source_ 源数据
   * @param {*} o 验证选项
   * @param {*} oc 用户回调
   */
  validate(source_, o = {}, oc = () => {}) {
    let source = source_;
    let options = o;
    let callback = oc; //用户cb
    if (typeof options === 'function') {
      callback = options;
      options = {};
    }
    if (!this.rules || Object.keys(this.rules).length === 0) {
      if (callback) {
        callback();
      }
      return Promise.resolve();
    }

    // 调用用户回调，重新组建错误信息
    function complete(results) {
      let i;
      let errors = [];
      let fields = {};

      function add(e) {
        if (Array.isArray(e)) {
          errors = errors.concat(...e);
        } else {
          errors.push(e);
        }
      }

      for (i = 0; i < results.length; i++) {
        add(results[i]);
      }
      if (!errors.length) {
        errors = null;
        fields = null;
      } else {
        fields = convertFieldsError(errors);
      }
      // errors和fields都是错误信息，只是组织方式不同，一个是[e,e],一个是{k:[e,e]}
      callback(errors, fields);
    }

    // 这里逻辑有点问题吧，this.messages() 返回的就是defaultMessages，defaultMessages本身就来自newMessages()
    // 处理消息
    //-------------------------------------------------
    if (options.messages) {
      let messages = this.messages();
      if (messages === defaultMessages) {
        messages = newMessages();
      }
      deepMerge(messages, options.messages);
      options.messages = messages;
    } else {
      options.messages = this.messages();
    }
    //-------------------------------------------
    let arr;
    let value;
    const series = {};
    const keys = options.keys || Object.keys(this.rules);
    // 处理每个key下的每个rule,和kek下的值,给后续验证做准备
    // 获得series:{key:[{},{}]}
    keys.forEach(z => {
      arr = this.rules[z];
      value = source[z];
      arr.forEach(r => {
        let rule = r;
        // 优先处理transform
        if (typeof rule.transform === 'function') {
          //拷贝一份
          if (source === source_) {
            source = { ...source };
          }
          value = source[z] = rule.transform(value);
        }
        // 单规则是方法的转换成对象格式
        if (typeof rule === 'function') {
          rule = {
            validator: rule,
          };
        } else {
          // 拷贝一份
          rule = { ...rule };
        }
        // 确定验证方法，自定义或者内置，这一步最关键
        rule.validator = this.getValidationMethod(rule);
        rule.field = z;
        // 这个fullField可以接受使用外界提供的值
        rule.fullField = rule.fullField || z;
        // 确定类型
        rule.type = this.getType(rule);
        if (!rule.validator) {
          return;
        }
        series[z] = series[z] || [];
        series[z].push({
          rule, //验证规则
          value, //待验证的值
          source, //原始值所在的对象
          field: z, //值在原始对象的key
        });
      });
    });
    const errorFields = {};
    return asyncMap(
      series,
      options,
      // 执行验证逻辑
      // doit是下一个规则验证rule
      (data, doIt) => {
        // 这个data是serie
        const rule = data.rule;
        // defaultField是深度验证是子属性全部执行同一个规则
        // 是否深度验证
        let deep =
          (rule.type === 'object' || rule.type === 'array') &&
          (typeof rule.fields === 'object' ||
            typeof rule.defaultField === 'object');
        // required或者有值有其一便触发验证
        deep = deep && (rule.required || (!rule.required && data.value));
        rule.field = data.field;

        function addFullfield(key, schema) {
          return {
            ...schema,
            fullField: `${rule.fullField}.${key}`, //fullfield是为了deep，存储其完整的属性路径
          };
        }

        // 单一rule验证结束回调
        // 处理errors消息和深度验证
        function cb(e = []) {
          let errors = e;
          if (!Array.isArray(errors)) {
            errors = [errors];
          }
          if (!options.suppressWarning && errors.length) {
            // 打印的是原始的消息，内置消息
            Schema.warning('async-validator:', errors);
          }
          if (errors.length && rule.message) {
            // 使用rule定义的message
            // 原先有多条的内置消息，被改成了一条用户指定的消息
            errors = [].concat(rule.message);
          }

          // 把错误消息转换成[{e,filed}]
          errors = errors.map(complementError(rule));

          if (options.first && errors.length) {
            errorFields[rule.field] = 1;
            return doIt(errors);
          }
          if (!deep) {
            doIt(errors);
          } else {
            // if rule is required but the target object
            // does not exist fail at the rule level and don't
            // go deeper
            // 深度验证
            // required但是没有值
            if (rule.required && !data.value) {
              if (rule.message) {
                errors = [].concat(rule.message).map(complementError(rule));
              } else if (options.error) {
                errors = [
                  options.error(
                    rule,
                    format(options.messages.required, rule.field),
                  ),
                ];
              }
              return doIt(errors);
            }

            let fieldsSchema = {};
            // 深度验证，每个key使用默认的rule
            if (rule.defaultField) {
              for (const k in data.value) {
                if (data.value.hasOwnProperty(k)) {
                  fieldsSchema[k] = rule.defaultField;
                }
              }
            }
            // 合并默认rule和在fields中指定的rule，优先使用指定的
            fieldsSchema = {
              ...fieldsSchema,
              ...data.rule.fields,
            };
            for (const f in fieldsSchema) {
              if (fieldsSchema.hasOwnProperty(f)) {
                const fieldSchema = Array.isArray(fieldsSchema[f])
                  ? fieldsSchema[f]
                  : [fieldsSchema[f]];
                // 某个key下的一套rule，因为深度追加Fullfield全路径属性
                fieldsSchema[f] = fieldSchema.map(addFullfield.bind(null, f));
              }
            }
            const schema = new Schema(fieldsSchema);
            // 合并用户的message
            schema.messages(options.messages);
            // rule下定义options
            if (data.rule.options) {
              data.rule.options.messages = options.messages;
              data.rule.options.error = options.error;
            }
            // 这里递归validate
            schema.validate(data.value, data.rule.options || options, errs => {
              // 这个是递归schema验证的回调，调用外部的schema的doit结束内部的schema，并传递error出去
              const finalErrors = [];
              if (errors && errors.length) {
                finalErrors.push(...errors);
              }
              if (errs && errs.length) {
                finalErrors.push(...errs);
              }
              // 下一个rule
              doIt(finalErrors.length ? finalErrors : null);
            });
          }
        }

        // 验证流程
        let res;
        if (rule.asyncValidator) {
          // 可以返回promise或者手动调用cb
          // 异步验证
          res = rule.asyncValidator(rule, data.value, cb, data.source, options);
        } else if (rule.validator) {
          // 同步验证，手动调用cb，或者返回true或者false
          res = rule.validator(rule, data.value, cb, data.source, options);
          if (res === true) {
            cb();
          } else if (res === false) {
            cb(rule.message || `${rule.field} fails`);
          } else if (res instanceof Array) {
            cb(res);
          } else if (res instanceof Error) {
            cb(res.message);
          }
        }
        if (res && res.then) {
          res.then(
            () => cb(),
            e => cb(e),
          );
        }
      },
      results => {
        complete(results);
      },
    );
  },
  // 确定验证规则的类型
  // 没提供type，除了正则，默认是string
  getType(rule) {
    if (rule.type === undefined && rule.pattern instanceof RegExp) {
      rule.type = 'pattern';
    }
    if (
      typeof rule.validator !== 'function' &&
      rule.type &&
      !validators.hasOwnProperty(rule.type)
    ) {
      throw new Error(format('Unknown rule type %s', rule.type));
    }
    return rule.type || 'string';
  },
  // 返回内置的验证方法
  getValidationMethod(rule) {
    // 已经是方法了不处理了
    if (typeof rule.validator === 'function') {
      return rule.validator;
    }
    // 特殊的required
    const keys = Object.keys(rule);
    const messageIndex = keys.indexOf('message');
    if (messageIndex !== -1) {
      keys.splice(messageIndex, 1);
    }
    if (keys.length === 1 && keys[0] === 'required') {
      return validators.required;
    }
    // 其他取值
    return validators[this.getType(rule)] || false;
  },
};

// 手动注册自定义的类型验证
Schema.register = function register(type, validator) {
  if (typeof validator !== 'function') {
    throw new Error(
      'Cannot register a validator by type, validator is not a function',
    );
  }
  validators[type] = validator;
};

Schema.warning = warning;

Schema.messages = defaultMessages;

Schema.validators = validators;

export default Schema;
