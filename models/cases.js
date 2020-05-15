const  mongoose = require('mongoose');

mongoose.Promise = global.Promise

const messageSchema = new mongoose.Schema({
    message: {
	type: String,
	required: true
    },
    name: {
	type: String,
	required: true
    },
    date: {
	type: Date,
	required: true
    }
});

const linkSchema = new mongoose.Schema({
    side: {
	type: String,
	enum: ['judge', 'plaintiff', 'defendant', 'amici'],
	required: true
    },
    name: {
	type: String,
	required: true
    },
    path: {
	type: String,
	required: true
    },
    version: {
	type: Number,
	require: true
    },
    date: {
	type: Date,
	required: true 
    }
});

const personSchema = new mongoose.Schema({
    person: {
	type: String,
	required: true
    },
    token: {
	type: String,
	required: true
    }
});

const caseSchema = new mongoose.Schema({
    name: {
	type: String,
	required: true
    },
    docket: {
	type: String,
	required: true
    },
    house: {
	type: String,
	required: true
    },
    level: {
	type: String,
	enum: ['federal', 'state'],
	required: true
    },
    type: {
	type: String,
	enum: ['criminal', 'civil'],
	required: true
    },
    date: {
	type: Date,
	required: true
    },
    appeal: {
	type: Boolean,
	required: true
    },
    seal: {
	type: Boolean,
	default: false
    },
    close: {
	type: Boolean,
	default: false
    },
    judge: {
	type: personSchema,
	required: true
    },
    plaintiff: {
	type: personSchema,
	required: true
    },
    defendant: {
	type: personSchema,
	required: true
    },
    amici: {
	type: personSchema
    },
    links: {
	type: [linkSchema],
	default: []
    },
    messages: {
	type: [messageSchema],
	default: []
    }
});

module.exports = mongoose.model('Case', caseSchema);
