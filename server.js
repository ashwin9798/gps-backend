var express = require('express');
var bodyParser = require('body-parser');
var mysql = require('mysql');
var cors = require('cors');
var path = require('path');

var app = express();

//database configuration on Heroku ClearDB
var db_config = {
    host            : process.env.HOST,
    user            : process.env.USER,
    password        : process.env.PASSWORD,
    database        : process.env.DATABASE
};


//this is the client that will open the connection
var mysqlClient = mysql.createConnection(db_config);
handleDisconnect(mysqlClient);


//body parser allows us to easily look at the json that is sent through the server.
app.use(bodyParser.urlencoded({
  extended: true
}));

app.use(bodyParser.json())
app.use(cors())
app.use(express.static(__dirname));


var port = process.env.PORT || 3000;

var router = express.Router();

//whenever the sql server closes the connection, this function will reconnect
function handleDisconnect(client) {
  client.on('error', function (error) {
    if (!error.fatal) return;
    if (error.code !== 'PROTOCOL_CONNECTION_LOST') throw err;

    console.error('> Re-connecting lost MySQL connection: ' + error.stack);

    mysqlClient = mysql.createConnection(client.config);
    handleDisconnect(mysqlClient);
    mysqlClient.connect();
  });
};

app.listen(port);

//the web browser will make a get request at the root url since it is only a single page application.
//The root url on heroku is: https://pure-hollows-72424.herokuapp.com/
router.get('/', function(req, res) {
    res.sendFile(path.join(__dirname + '/index.html'));
});


var dataRoute = router.route('/data')

dataRoute.get(function(req, res) {
    mysqlClient.query("(SELECT * FROM gps_data_table ORDER BY id DESC LIMIT 100) ORDER BY id ASC", function(err, result, fields) {
        if(err) throw err;
        res.json(result)
    })
});

dataRoute.post(function(req, res) {
    if(req.body.time == nan || req.body.latitude == 0 && req.body.longitude == 0)
      res.json({message: "gps is not getting a fix"})
    else {
      let payload = {
        timeAdded: req.body.time,
        latitude: req.body.latitude,
        longitude: req.body.longitude
      }

      var sql = "INSERT INTO gps_data_table SET ?"
      mysqlClient.query(sql, payload, function (err, rows) {
        if (err) throw err;
        res.json({message: "you posted successfully!!"})
      });
    }
})

//the raspberry pi will post data to the database through this post request at the same root url.
//we will create a json object with three fields, and send it through http.

app.use(router);

console.log('data available on port' + port);
