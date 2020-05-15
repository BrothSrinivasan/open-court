const PDF_MAGIC = Buffer.from([37, 80, 68, 70]);

function filterMap(f) {
    switch(f) {
	case 'appellate':
	    return {appeal: true};
	case 'original':
	    return {appeal: false};
	case 'federal':
	    return {level: 'federal'};
	case 'state':
	    return {level: 'state'};
	case 'closed':
	    return {close: true};
	case 'open':
	    return {close: false};
	case 'sealed':
	    return {seal: true};
	case 'public':
	    return {seal: false};
	case 'criminal':
	    return {type: 'criminal'};
	case 'civil':
	    return {type: 'civil'};
	case undefined:
	    return {};
	default:
	    return {message: "ERROR 400: FILTER DOES NOT EXIST"};
    }
}

function auth(req, res, next) {
    if(!req.session.token)
	res.render('error', {message: "ERROR 401: UNAUTHORIZED ENTRY"});
    else
	next();
}

module.exports = {
    pdfMagic: PDF_MAGIC,
    filterMap: filterMap,
    randInt: () => { return "" + Math.floor(Math.random() * Math.floor(Date.now())); },
    auth: auth
};
