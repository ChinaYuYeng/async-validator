import Schema from '../src/';

describe('my test', () => {
  it('works for type', done => {
    new Schema({
      pp: [
        {
          required: true,
          // type:'array',
          // len:2,
          // fields:{
          //   a:{
          //     required:true,
          //     max:0,
          //     message:'m2'
          //   },
          //   b:{
          //     required:true
          //   }
          // }
        },
        {
          required: true,
          type: 'array',
          // defaultField:{
          //   required:true
          // }
          fields: {
            0: { required: true },
            1: { required: true },
          },
        },
        {
          len: 2,
        },
      ],
      kk: [{ type: 'number', min: 2 }, { max: 2 }],
    }).validate(
      {
        pp: [],
        kk: 1,
      },
      {
        firstFields: false,
      },
      errors => {
        console.log(errors);
        // expect(errors.length).toBe(1);
        // expect(errors[0].message).toBe('v is not an array');
        done();
      },
    );
  });
});
