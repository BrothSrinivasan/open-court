// Libraries
const express = require('express');
const bodyParser = require('body-parser');
const logger = require('morgan');
const exphbs = require('express-handlebars');
const hbs = require('handlebars');
const moment = require('moment');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const _ = require('underscore');
const fileUpload = require('express-fileupload');
const session = require('express-session');
const  uqid = require('uniqid');
const fs = require('fs');
const rmdir = require('rimraf');
const http = require('http');
const socket = require('socket.io');
const Case = require('./models/cases');
const pdfMagic = require('./helper').pdfMagic;
const filterMap = require('./helper').filterMap;
const randInt = require('./helper').randInt;
const auth = require('./helper').auth;

// Environment
dotenv.config();

// Global
const app = express();
const server = http.Server(app);
const io = socket(server);
const {allowInsecurePrototypeAccess} = require('@handlebars/allow-prototype-access');
const eghbs = exphbs.create({
    defaultLayout: 'main',
    partialsDir: 'views/partials/',
    handlebars: allowInsecurePrototypeAccess(hbs),
    helpers: {
	eq: (val1, val2, val3, options) => {
	    if(val2 == val3)
		return options.fn(val1);
	    else
		return options.inverse(val1);
	}, noteq: (val1, val2, val3, options) => {
	    if(val2 != val3)
		return options.fn(val1);
	    else
		return options.inverse(val1);
	}, capital: (val1) => {
	    return val1.toString()[0].toUpperCase() + val1.toString().slice(1);
	}
    }
});

// Setting up database
mongoose.Promise = global.Promise;
mongoose.connect(process.env.MONGODB, { useNewUrlParser: true, useUnifiedTopology: true  })
mongoose.connection.on('error', function() {
    console.log("Error connecting")
    process.exit(1)
});

// Middleware
app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(fileUpload({ createParentPath: true }));
app.engine('handlebars', eghbs.engine);

app.set('view engine', 'handlebars');
app.use('/public', express.static('public'));
app.use(session({
    name: 'sessID',
    resave: false,
    saveUninitialized: false,
    secret: 'my-secret',
    cookie: {
	sameSite: true,
	secure: false,
    }
}))

// Routing
app.get('/', (req, res) => {
    return res.render('home');
});

app.get('/create', (req, res) => {
    return res.render('create');
});

app.post('/create', (req, res) => {
    var error = false;
    
    if(req.body.docket.trim().includes(' '))
	return res.render('error', {message: "ERROR 406: DOCKET NUMBER IS INVALID"});
    else {
	Case.findOne({docket: req.body.docket}, function(err, cases) {
	    if(err)
		return res.render('error', {message: "ERROR 500: FIND FAILED"});
	    else {
		if(!cases) {
		    var newcase = new Case({
			name: req.body.name,
			docket: req.body.docket.trim(),
			house: req.body.house,
			level: req.body.level,
			type: req.body.type,
			date: req.body.date + " 00:00:00",
			appeal: req.body.appeal,
			judge: {person: req.body.judge, token: uqid('j', randInt())},
			plaintiff: {person: req.body.plaintiff, token: uqid('p', randInt())},
			defendant: {person: req.body.defendant, token: uqid('d', randInt())}
		    });
		    
		    fs.mkdirSync("./public/cases/" + req.body.docket + "/archive", {recursive: true});

		    if(!fs.existsSync('./public/cases/archive'))
			fs.mkdirSync("./public/cases/archive");
		    
		    newcase.save((err) => {
			if(err)
			    return res.render('error', {message: "ERROR 500: COULD NOT SAVE TO MONGO"})
			else {
			    req.session.token = newcase.judge.token;
			    req.session.url = '/case/judge?docket=' + req.body.docket;
			    
			    return res.redirect('/case/judge?docket=' + req.body.docket);
			}
		    });
		} else
		    return res.render('error', {message: "ERROR 400: DOCKET NUMBER ALREADY EXISTS"});
	    }
	});
    }
});

app.get('/join', (req, res) => {
    return res.render('join', {url: req.session.url, authed: req.session.url != undefined});
});

app.post('/join', (req, res) => {
    var token = req.body.token;
    
    Case.find({$or: [{'judge.token': token}, {'plaintiff.token': token}, {'defendant.token': token}]}, (err, cases) => {
	if(err)
	    return res.render('error', {message: "ERROR 500: FIND FAILED"});
	else {
	    if(cases.length == 0)
		res.render('error', {message: "ERROR 404: CASE DOES NOT EXIST"});
	    else {
		req.session.token = token;
		
		if(cases[0].plaintiff.token == token) {
		    req.session.url = '/case/plaintiff?docket=' + cases[0].docket;
		    
		    return res.redirect('/case/plaintiff?docket=' + cases[0].docket);
		} else if(cases[0].defendant.token == token) {
		    req.session.url = '/case/defendant?docket=' + cases[0].docket;
		    
		    return res.redirect('/case/defendant?docket=' + cases[0].docket);
		} else {
		    req.session.url = '/case/judge?docket=' + cases[0].docket;
		    
		    return res.redirect('/case/judge?docket=' + cases[0].docket);
		}
	    }
	}
    });
});

app.get('/case', (req, res) => {
    var docket = req.query.docket;
    
    Case.findOne({docket: docket}, (err, cases) => {
	if(err)
	    return res.render('error', {message: "ERROR 500: FIND FAILED"});
	else {
	    if(!cases)
		res.render('error', {message: "ERROR 404: CASE DOES NOT EXIST"});
	    else
		res.render('case', {cases: cases, length: true, party: 'amici'});
	}
    });
});

app.get('/case/:person', auth, (req, res) => {
    var person = req.params.person.toLowerCase();
    var docket = req.query.docket;
    
    if(['judge', 'plaintiff', 'defendant'].includes(person)) {
	Case.findOne({docket: docket}, (err, cases) => {
	    if(err)
		return res.render('error', {message: "ERROR 500: FIND FAILED"});
	    else {
		if(!cases)
		    res.render('error', {message: "ERROR 404: CASE DOES NOT EXIST"});
		else if(cases[person].token != req.session.token) {
		    res.render('error', {message: "ERROR 401: UNAUTHORIZED ENTRY"});
		}
		else if(cases.plaintiff.token == 'revoked access' && person != 'judge') {
		    req.session.destroy((err) => {
			if(err)
			    throw err;
			else {
			    res.clearCookie('sessID');
			    res.render('error', {message: "ERROR 401: UNAUTHORIZED ENTRY"});
			}
		    });
		} else
		    res.render('case', {cases: cases, length: true, party: person});
	    }
	});
	
    } else
	return res.render('error', {message: "ERROR 404: INCORRECT REQUEST"});
});

app.post('/upload', (req, res) => {
    if(req.files && pdfMagic.equals(req.files.path.data.slice(0, 4))) {
	var name = req.files.path.name;
	var salt = Math.random();
	var path = req.body.docket + "/" + req.body.person + "/" + name;
	var archive = "./public/cases/" + req.body.docket + "/archive/" + name + "#" + salt;
	
	Case.findOne({docket: req.body.docket}, (err, cases) => {
	    if(err)
		return res.render('error', {message: "ERROR 500: FIND FAILED"});
	    else {
		if(!cases)
		    return res.render('error', {message: "ERROR 404: CASE DOES NOT EXIST"});
		else {
		    var exists = _.findWhere(cases.links, {name: name, side: req.body.person});
		    
		    if(exists) {
			exists.version += 1;
			exists.date = Date.now();
			fs.renameSync('./public/cases/' + path, archive);
		    } else {
			cases.links.push({
			    side: req.body.person,
			    name: name,
			    path: '/download/' + path,
			    version: 1,
			    date: Date.now()
			});
		    }
		    
		    req.files.path.mv('./public/cases/' + path, (err) => {
			if(err) {
			    if(exists)
				fs.renameSync(archive, './public/cases/' + path)
			    
			    return res.render('error', {message: "ERROR 500: UPLOAD FAILED"});
			} else {
			    cases.save((err) => {
				if(err) {
				    if(exists)
					fs.renameSync(archive, './public/cases/' + path)
				    
				    return res.render('error', {message: "ERROR 500: COULD NOT SAVE TO MONGO"});
				} else {
				    if(req.body.person == 'amici')
					return res.redirect('/case?docket=' + req.body.docket);
				    else
					return res.redirect('/case/' + req.body.person + '?docket=' + req.body.docket);
				}
			    });
			}
		    });
		}
	    }
	});
    } else
	return res.render('error', {message: "ERROR 400: NO PROPER FILE PROVIDED"});
});

app.get('/download/:docket/:side/:path', (req, res) => {
    var docket = req.params.docket;
    var side = req.params.side;
    var path = req.params.path;
    
    res.download('./public/cases/' + docket + "/" + side + "/" + path, path);
});

app.get('/viewall', (req, res) => {
    var filter = filterMap(req.query.filter);
    
    if(filter['message'] == undefined) {	
	Case.find(filter, (err, cases) => {
	    if(err)
		return res.render('error', {message: "ERROR 500: FIND FAILED"})
	    else {
		cases = _.groupBy(_.sortBy(_.sortBy(cases, 'name'), 'house'), 'house',);
		
		return res.render('view', {cases: cases, length: Object.keys(cases).length == 0});
	    }
	});
    } else
	return res.render('error', filter);
});

app.get('/about', (req, res) => {
    return res.render('about');
});

app.put('/seal', (req, res) => {
    Case.findOne({docket: req.body.docket}, (err, cases) => {
	if(err)
	    return res.status(500).send("find failed");
	else {
	    if(!cases)
		return res.status(400).send("case cannot be found");
	    else {
		cases.seal = !cases.seal;
		
		cases.save((err) => {
		    if(err)
			return res.status(500).send("could not save");
		    else
			return res.send('OK');
		});
	    }
	}
    });
});

app.put('/close', (req, res) => {
    Case.findOne({docket: req.body.docket}, (err, cases) => {
	if(err)
	    return res.status(500).send("case cannot be found");
	else {
	    if(!cases)
		return res.status(400).send("case cannot be found");
	    else {
		cases.close = true;
		cases.plaintiff.token = 'revoked access';
		cases.defendant.token = 'revoked access';
		
		cases.save((err) => {
		    if(err)
			return res.status(500).send("could not save");
		    else
			return res.send('OK');
		});
	    }
	}
    });
});

app.delete('/remove', (req, res) => {
    var salt = Math.random();
    var path = "./public/cases/" + req.body.docket + "/" + req.body.side + "/" + req.body.filename;
    var archive = "./public/cases/" + req.body.docket + "/archive/" + req.body.filename + "#" + salt;
    
    Case.findOne({docket: req.body.docket}, (err, cases) => {
	if(err)
	    return res.status(500).send("case cannot be found");
	else {
	    if(!cases)
		return res.status(400).send("case cannot be found");
	    else {
		var exists = _.findWhere(cases.links, {name: req.body.filename, side: req.body.side});
		
		if(exists) {
		    cases.links = _.without(cases.links, exists);
		    
		    cases.save((err) => {
			if(err)
			    return res.status(500).send("could not save");
			else {
			    fs.renameSync(path, archive);
			    
			    req.session.destroy((err) => {
				if(err)
				    throw err;
				else {
				    res.clearCookie('sessID');
				    return res.send('OK');
				}
			    });
			}
		    });
		    
		} else
		    return res.status(400).send("file cannot be found");
	    }
	}
    });
});

app.delete('/delete', (req, res) => {
    var salt = Math.random();
    var path = "./public/cases/" + req.body.docket;
    var archive = "./public/cases/archive/" + req.body.docket + "#" + salt;
    
    Case.deleteOne({docket: req.body.docket}, (err, result) => {
	if(err)
	    return res.status(500).send("case cannot be found");
	else {
	    if(result.ok != 1)
		return res.status(400).send("case cannot be found");
	    else {
		fs.renameSync(path, archive);
		return res.send('OK');
	    }
	}
    });
});

app.post('/chat', auth, (req, res) => {
    Case.findOne({docket: req.body.docket}, (err, cases) => {
	if(err)
	    return res.status(500).send('case cannot be found');
	else {
	    if(!cases)
		return res.status(400).send("case cannot be found");
	    else {
		if(cases.messages.length > 10) {
		    cases.messages = [{
			message: req.body.msg,
			name: cases[req.body.party].person,
			date: req.body.date
		    }];
		} else {
		    cases.messages.push({
			message: req.body.msg,
			name: cases[req.body.party].person,
			date: req.body.date
		    });
		}

		cases.save((err) => {
		    if(err)
			return res.status(500).send("could not save");
		    else {
			var packet = {msg: req.body.msg,
				      name: cases[req.body.party].person,
				      date: req.body.date,
				      party: req.body.party
			};
			
			io.emit('chat', packet)
			
			return res.send('OK')
		    }
		});
	    }
	}
    });
});

app.get('/api', (req, res) => {
    if(req.query.pwd == 'cmsc389k') {
	Case.find({}, (err, cases) => {
	    if(err)
		return res.render('error', {message: "ERROR 500: FIND FAILED"});
	    else
		return res.send(cases);
	});
    } else {
	res.render('error', {message: "ERROR 401: UNAUTHORIZED ENTRY"});
    }
});

/* MASTER CONTROL FOR CLEARING SPACE */

app.get('/deleteAll', (req, res) => {
    if(req.query.pwd == 'cmsc389k') {
	Case.deleteMany({}, (err, cases) => {
	    rmdir('public/cases/*', function(error){});
	    console.log("OK");
	    res.redirect('/');
	});
    } else {
	res.render('error', {message: "ERROR 401: UNAUTHORIZED ENTRY"});
    }
});

/* MASTER CONTROL USE ONLY */

app.get('*', function(req, res) {
    res.render('error', {message: "404 ERROR: PAGE NOT FOUND"});
});

server.listen(3000, function() {
    console.log('Listening on port 3000!');
});

io.on('connection', (socket) => {
    console.log("new connection");
    
    socket.on('disconnect', () => {
	console.log("user disconnected");
    });
});
