'use strict';

const validate = require( 'validate.js' );
const Promise  = require( 'bluebird' );
const _        = require( 'lodash' );

validate.Promise = Promise;

let types = [ 'String', 'Array', 'Boolean', 'Object', 'Number' ];

types.forEach( type => {
	let name = 'is' + type;
	validate.validators[ name ] = val => {
		return new Promise( res => {
			if ( undefined === val || _[ name ]( val ) ) {
				res();
			} else {
				res( 'not expected type' );
			}
		});
	};
});

validate.extend( validate.validators.datetime, {
	parse: ( value ) => Date.parse( value ),
	format: ( value ) => new Date( value )
});

module.exports = validate;

/**
 * Formats the errors.
 * @param {mixed} errs Array or string of error text.
 * @return {string}
 */
module.exports.format = function( errs ) {
	if ( 'string' === typeof errs ) {
		return errs;
	}
	return _.map( errs, err => err.join( ', ' ) ).join( ', ' );
};

/**
 * Normalizes a boolean query value.
 * @param {mixed} boolean Value to parse.
 * @return {boolean}
 */
module.exports.normalizeBool = function( boolean ) {
	if ( 'true' === boolean || '1' === boolean || true === boolean ) {
		return true;
	} else {
		return false;
	}
};
