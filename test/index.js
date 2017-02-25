/* eslint-env node, mocha */

before( 'create db', function( done ) {
	let knex = require( '../helpers/db' );

	knex.migrate.latest()
	.then( () => knex.seed.run() )
	.then( () => done() );
});

describe( 'User Hub', require( './helper-hub' ) );

describe( 'GetMemberAwards', require( './endpoint-get-member-awards' ) );