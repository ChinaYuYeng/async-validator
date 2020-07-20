/* eslint no-console:0 */

const formatRegExp = /%[sdj%]/g;

export let warning = () => {};

// don't print warning message when in production env or node runtime
if (
  typeof process !== 'undefined' &&
  process.env &&
  process.env.NODE_ENV !== 'production' &&
  typeof window !== 'undefined' &&
  typeof document !== 'undefined'
) {
  // 开发环境下打印警告信息
  warning = (type, errors) => {
    if (typeof console !== 'undefined' && console.warn) {
      if (errors.every(e => typeof e === 'string')) {
        console.warn(type, errors);
      }
    }
  };
}

// 按属性分配好错误信息
export function convertFieldsError(errors) {
  if (!errors || !errors.length) return null;
  const fields = {};
  errors.forEach(error => {
    const field = error.field;
    fields[field] = fields[field] || [];
    fields[field].push(error);
  });
  return fields;
}

// 字符串消息格式化，类似c言语的写法
export function format(...args) {
  let i = 1; //args的指针
  const f = args[0];
  const len = args.length;
  if (typeof f === 'function') {
    // 执行传入的逻辑
    return f.apply(null, args.slice(1));
  }
  if (typeof f === 'string') {
    // 替换所有的匹配字符
    let str = String(f).replace(formatRegExp, x => {
      if (x === '%%') {
        return '%';
      }
      if (i >= len) {
        return x;
      }
      switch (x) {
        case '%s':
          return String(args[i++]);
        case '%d':
          return Number(args[i++]);
        case '%j':
          try {
            return JSON.stringify(args[i++]);
          } catch (_) {
            return '[Circular]';
          }
          break;
        default:
          return x;
      }
    });
    for (let arg = args[i]; i < len; arg = args[++i]) {
      str += ` ${arg}`;
    }
    return str;
  }
  return f;
}

function isNativeStringType(type) {
  return (
    type === 'string' ||
    type === 'url' ||
    type === 'hex' ||
    type === 'email' ||
    type === 'pattern'
  );
}

// 不同的类型判断值是否为空
export function isEmptyValue(value, type) {
  if (value === undefined || value === null) {
    return true;
  }
  if (type === 'array' && Array.isArray(value) && !value.length) {
    return true;
  }
  if (isNativeStringType(type) && typeof value === 'string' && !value) {
    return true;
  }
  return false;
}

// 是否空对象
export function isEmptyObject(obj) {
  return Object.keys(obj).length === 0;
}

// 逐个一一验证不中断验证
function asyncParallelArray(arr, func, callback) {
  const results = [];
  let total = 0;
  const arrLength = arr.length;

  // 计数是否结束当前key下的rule
  function count(errors) {
    results.push.apply(results, errors);
    total++;
    if (total === arrLength) {
      // 下一个key
      callback(results);
    }
  }

  arr.forEach(a => {
    func(a, count);
  });
}

/***
 * 

有错误就中断
 * arr:series数组
 * func:具体执行验证的逻辑
 * callback：结束回调，收集错误
 */
function asyncSerialArray(arr, func, callback) {
  let index = 0;
  const arrLength = arr.length;

  // 递归验证每个serie
  function next(errors) {
    // 中断递归
    if (errors && errors.length) {
      callback(errors);
      return;
    }
    const original = index;
    index = index + 1;
    if (original < arrLength) {
      func(arr[original], next);
    } else {
      // 结束回调，没有错误
      callback([]);
    }
  }

  next([]);
}

// 把所有的rule全放一个数组里了。。
function flattenObjArr(objArr) {
  const ret = [];
  Object.keys(objArr).forEach(k => {
    ret.push.apply(ret, objArr[k]);
  });
  return ret;
}

export class AsyncValidationError extends Error {
  constructor(errors, fields) {
    super('Async Validation Error');
    this.errors = errors;
    this.fields = fields;
  }
}

// 验证分支
/**
 *
 * @param {*} objArr series
 * @param {*} option 验证配置项
 * @param {*} func 验证执行
 * @param {*} callback 用户回调标志着一个schema结束
 */
export function asyncMap(objArr, option, func, callback) {
  // 第一个错了就结束
  if (option.first) {
    const pending = new Promise((resolve, reject) => {
      // 这个方法调用验证结束
      const next = errors => {
        // 这个callback包装了用户的cb
        callback(errors);
        return errors.length
          ? reject(new AsyncValidationError(errors, convertFieldsError(errors)))
          : resolve();
      };
      // Serial整合到一个数组
      const flattenArr = flattenObjArr(objArr);
      asyncSerialArray(flattenArr, func, next);
    });
    pending.catch(e => e);
    return pending;
  }
  let firstFields = option.firstFields || [];
  if (firstFields === true) {
    firstFields = Object.keys(objArr);
  }
  const objArrKeys = Object.keys(objArr);
  const objArrLength = objArrKeys.length;
  let total = 0;
  const results = [];
  const pending = new Promise((resolve, reject) => {
    // 下一个key的rule
    const next = errors => {
      results.push.apply(results, errors);
      total++;
      if (total === objArrLength) {
        // 用户回调
        callback(results);
        return results.length
          ? reject(
              new AsyncValidationError(results, convertFieldsError(results)),
            )
          : resolve();
      }
    };
    // 没有验证规则，直接结束
    if (!objArrKeys.length) {
      callback(results);
      resolve();
    }
    // 执行验证
    objArrKeys.forEach(key => {
      const arr = objArr[key];
      if (firstFields.indexOf(key) !== -1) {
        // 指定key下任何一个规则出错就直接结束当前key，继续下一个key
        asyncSerialArray(arr, func, next);
      } else {
        // 指定key下依次执行验证
        asyncParallelArray(arr, func, next);
      }
    });
  });
  pending.catch(e => e);
  return pending;
}

// 封装错误信息，错误消息和错误field对应
export function complementError(rule) {
  return oe => {
    if (oe && oe.message) {
      oe.field = oe.field || rule.fullField;
      return oe;
    }
    return {
      message: typeof oe === 'function' ? oe() : oe,
      field: oe.field || rule.fullField,
    };
  };
}

// source属性值覆盖target属性，如果属性值是对象，没有深度拷贝
export function deepMerge(target, source) {
  if (source) {
    for (const s in source) {
      if (source.hasOwnProperty(s)) {
        const value = source[s];
        if (typeof value === 'object' && typeof target[s] === 'object') {
          target[s] = {
            ...target[s],
            ...value,
          };
        } else {
          target[s] = value;
        }
      }
    }
  }
  return target;
}

// 批量验证，并支持异步验证，是否中断执行，返回错误消息
export const exec = function(arr, first, options, cb) {
  let next, i, p;
  return (p = new Promise((resolve, reject) => {
    i = 0;
    const errors = [];
    next = function(e) {
      errors.push(...e);
      if ((first && errors.length) || i > arr.length - 1) {
        cb && cb(errors);
        resolve(errors);
        return;
      }
      _validate(arr[i++], next, options);
    };
    _validate(arr[i++], next, options);
  }));
};

// 执行验证，并处理验证消息
function _validate(data, next, options) {
  const rule = data.rule;
  rule.validator = rule.validator || rule.asyncValidator;
  const res = rule.validator(rule, data.value, pocessMsg, data.source, options);
  // validator 没调用pocessMsg，系统调用
  if (res === true) {
    pocessMsg();
  } else if (res === false) {
    pocessMsg(rule.messages || `${rule.field} fails`);
  } else if (res && res.then) {
    res.then(pocessMsg);
  } else if (res instanceof Error) {
    pocessMsg(res);
  }
  // 格式化错误对象
  function pocessMsg(e = []) {
    let errors = e;
    if (!Array.isArray(errors)) {
      errors = [errors];
    }
    if (errors.length && rule.message) {
      // 使用rule定义的message
      // 原先有多条的内置消息，被改成了一条用户指定的消息
      errors = [].concat(rule.message);
    }
    errors = errors.map(oe => {
      if (oe && oe.message) {
        oe.field = oe.field || rule.fullField;
        return oe;
      }
      return {
        message: typeof oe === 'function' ? oe() : oe,
        field: oe.field || rule.fullField,
      };
    });
    next(errors);
  }
}
