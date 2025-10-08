// const {Client} = require('pg');

// const client = new Client({
//   user: 'spintellengence_admin',
//   host: 'spintelligence-db.postgres.database.azure.com',
//   database: 'spintel_db',
//   port:5432,
//   password:"Qbic@2025",
//    ssl: {
//     rejectUnauthorized: false
//   }
// });




// module.exports = client
// // con.connect().then(()=> console.log("connected"));

// // con.query(`SELECT * FROM Screens;`,(err,res)=>{
// //     if(err){
// //         console.log(res.rows);
// //     }else{
// //         console.log(err.message);
// //     }
// //     con.end;
        
// // })  

const {Client} = require('pg');
require('dotenv').config();


const client = new Client({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  port:process.env.DB_PORT,
  password:process.env.DB_PASSWORD,
  ssl: {
  rejectUnauthorized: false
}
});


module.exports = client
// con.connect().then(()=> console.log("connected"));

// con.query(`SELECT * FROM Screens;`,(err,res)=>{
//     if(err){
//         console.log(res.rows);
//     }else{
//         console.log(err.message);
//     }
//     con.end;
        
// })  
