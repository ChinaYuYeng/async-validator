export const validate = (source_, o = {}, oc = () => {}) => {
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
  const errorFields = {};
};

function _validate(data, next, options) {
  const rule = data.rule;
  rule.validator = rule.validator || rule.asyncValidator;
  const res = rule.validator(rule, data.value, next, data.source, options);
  if (res === true) {
    next();
  } else if (res === false) {
    next(pocessMsg(rule.messages || `${rule.field} fails`));
  } else if (res && res.then) {
    res.then(pocessMsg);
  } else {
    next(pocessMsg(res));
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
  }
}

function controller(series, options, callback) {
  let reslut = [];
  const exec = function(arr, first, cb) {
    let next, i, p;
    return (p = new Promise((resolve, reject) => {
      i = 0;
      const errors = [];
      next = function(e) {
        errors.concat(e);
        if ((first && errors.length) || i > arr.length - 1) {
          cb && cb(errors);
          resolve(errors);
        }
        _validate(arr[i++], next, options);
      };
      _validate(arr[i++], next, options);
    }));
  };
  if (options.first) {
    const flattenArr = flattenObjArr(objArr);
    return exec(flattenArr, true, es => {
      callback(reslut.concat(es));
    });
  } else if (options.firstField) {
    let keys = Object.keys(series);
    let ps = keys.map(key => {
      return exec(series[key], true);
    });
    return Promise.all(ps).then(errArray => {
      [].concat.apply(reslut, errArray);
      callback(reslut);
      return reslut;
    });
  } else {
    let keys = Object.keys(series);
    let ps = keys.map(key => {
      return exec(series[key], false);
    });
    return Promise.all(ps).then(errArray => {
      [].concat.apply(reslut, errArray);
      callback(reslut);
      return reslut;
    });
  }
}

function flattenObjArr(objArr) {
  const ret = [];
  Object.keys(objArr).forEach(k => {
    ret.push.apply(ret, objArr[k]);
  });
  return ret;
}

function formart(rules) {
  let arr;
  let value;
  const series = {};
  const keys = options.keys || Object.keys(rules);
  // 处理每个key下的每个rule,和kek下的值,给后续验证做准备
  // 获得series:{key:[{},{}]}
  keys.forEach(z => {
    arr = rules[z];
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
  return series;
}
