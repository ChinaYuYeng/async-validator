import { Schema } from './index';
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
      //   },cd
      //   b:{
      //     required:true
      //   }
      // }
    },
  ],
}).validate(
  {
    pp: null,
  },
  errors => {
    console.log(errors);
    // expect(errors.length).toBe(1);
    // expect(errors[0].message).toBe('v is not an array');
    done();
  },
);
