'use strict';

/* eslint-env node, mocha */

const should = require( 'should' ); // eslint-disable-line no-unused-vars
const _      = require( 'lodash' );

const helpers = require( './helpers' );
const resetDB = helpers.resetDB;
const hub = helpers.hub;

const VIPEndpoint = require( '../endpoints/vip' );

const AwardModel = require( '../models/award' );
const ActionModel = require( '../models/action' );

const errors = require( '../helpers/errors' );

module.exports = function() {
	it( 'constructs correctly', function() {
		let instance = new VIPEndpoint( hub(), 1 );
		instance.should.be.an.instanceOf( VIPEndpoint );
		instance.should.have.properties({
			Hub: hub(),
			userId: 1
		});
	});

	describe( 'GET /v1/vip', function() {
		it( 'returns awards for default status', function( done ) {
			new VIPEndpoint( null, 1 )
			.get({})
			.then( awards => {
				awards.should.be.an.Array().and.have.length( 2 );
				awards.forEach( validateAward );
				done();
			});
		});

		it( 'fails if checking all awards without permission', function() {
			new VIPEndpoint( hub( 403 ), 1 )
			.get({ status: 'all' })
			.should.be.rejected();
		});

		it( 'fails if checking pending awards without permission', function() {
			new VIPEndpoint( hub( 403 ), 1 )
			.get({ status: 'Requested' })
			.should.be.rejected();
		});

		it( 'works if checking awards with permission', function( done ) {
			new VIPEndpoint( hub(), 1 )
			.get({ status: 'all' })
			.then( awards => {
				awards.should.be.an.Array().and.have.length( 4 );
				awards.forEach( validateAward );
				done();
			});
		});

		it( 'checks both prestige and vip roles', function( done ) {
			let newHub = hub();
			newHub.hasOverOrgUnit = ( unit, roles ) => {
				roles.should.be.an.Array().and.containDeep([ 'prestige_view', 'vip_view' ]);
				return Promise.resolve( true );
			};

			new VIPEndpoint( newHub, 1 )
			.get({ status: 'all' })
			.then( () => done() );
		});

		it( 'can filter by before date', function( done ) {
			new VIPEndpoint( null, 2 )
			.get({ dateBefore: '2017-02-21' })
			.then( awards => {
				awards.should.be.an.Array().and.have.length( 1 );
				awards.forEach( validateAward );
				done();
			});
		});

		it( 'can filter by after date', function( done ) {
			new VIPEndpoint( null, 2 )
			.get({ dateAfter: '2017-02-21' })
			.then( awards => {
				awards.should.be.an.Array().and.have.length( 1 );
				awards.forEach( validateAward );
				done();
			});
		});

		it( 'can limit result size', function( done ) {
			new VIPEndpoint( null, 2 )
			.get({ limit: 1 } )
			.then( awards => {
				awards.should.be.an.Array().and.have.length( 1 );
				awards.forEach( validateAward );
				done();
			});
		});
	});

	describe( 'GET /v1/vip/{id}', function() {

		it( 'throws if award does not exist', function( done ) {
			new VIPEndpoint( null, 1 )
			.getOne( 100 )
			.catch( err => {
				err.should.be.an.Error().and.an.instanceOf( errors.NotFoundError );
				done();
			});
		});

		it( 'returns an approved award without permission', function( done ) {
			new VIPEndpoint( null, 2 )
			.getOne( 6 )
			.then( award => {
				validateAward( award );
				done();
			});
		});

		it( 'returns a non-approved award if it\' for the user', function( done ) {
			new VIPEndpoint( null, 1 )
			.getOne( 7 )
			.then( award => {
				validateAward( award );
				done();
			});
		});

		it( 'throws if non-approved and does not have permission', function( done ) {
			new VIPEndpoint( hub( 403 ), 2 )
			.getOne( 7 )
			.catch( err => {
				err.should.be.an.Error().and.an.instanceOf( errors.AuthError );
				done();
			});
		});

		it( 'returns a non-approved award and has permission', function( done ) {
			new VIPEndpoint( hub(), 2 )
			.getOne( 7 )
			.then( award => {
				validateAward( award );
				done();
			});
		});

		it( 'checks both prestige and vip roles', function( done ) {
			let newHub = hub();
			newHub.hasOverUser = ( user, roles ) => {
				roles.should.be.an.Array().and.containDeep([ 'prestige_view', 'vip_view' ]);
				return Promise.resolve( true );
			};

			new VIPEndpoint( newHub, 2 )
			.getOne( 7 )
			.then( () => done() );
		});
	});

	describe( 'POST /v1/vip', function() {

		beforeEach( 'reset data', resetDB );

		let data = {
			user: 2,
			category: 6,
			date: '2017-01-01',
			description: 'Test Award'
		};

		Object.keys( data ).forEach( key => {
			it( `fails without providing ${key}`, function( done ) {
				new VIPEndpoint( null, 1 ).create( _.omit( data, key ) )
				.catch( err => {
					err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
					done();
				});
			});
		});

		Object.keys( data ).forEach( key => {
			if ( 'description' === key ) {
				return;
			}
			it( `fails with malformed ${key}`, function( done ) {
				let badData = _.set( _.clone( data ), key, 'bad!' );
				new VIPEndpoint( null, 1 ).create( badData )
				.catch( err => {
					err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
					done();
				});
			});
		});

		it( 'fails if negative vip set without deduct action', function( done ) {
			new VIPEndpoint( null, 1 ).create( _.assign( {}, data, { vip: -10 } ) )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
				done();
			});
		});

		it( 'fails if saving with no vip', function( done ) {
			new VIPEndpoint( null, 1 ).create( data )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
				done();
			});
		});

		it( 'sets action to request for self', function( done ) {
			let newData = Object.assign( {}, data, { user: 'me', vip: 3 } );
			new VIPEndpoint( null, 1 ).create( newData )
			.then( award => {
				award.should.have.property( 'status', 'Requested' );
				done();
			});
		});

		it( 'sets the user ID for requesting self', function( done ) {
			let newData = Object.assign( {}, data, { user: 'me', vip: 3 } );
			new VIPEndpoint( null, 1 ).create( newData )
			.then( award => {
				award.should.have.property( 'user', 1 );
				done();
			});
		});

		it( 'does not check permission for self', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( null, 2 ).create( newData )
			.then( () => done() );
		});

		it( 'checks both prestige and vip roles for nominations', function( done ) {
			let newHub = hub();
			newHub.hasOverUser = ( user, roles ) => {
				roles.should.be.an.Array().and.containDeep([ 'prestige_nominate', 'vip_nominate' ]);
				return Promise.resolve( true );
			};

			let newData = Object.assign( {}, data, { vip: 3 } );

			new VIPEndpoint( newHub, 1 ).create( newData )
			.then( () => done() );
		});

		it( 'sets the correct status for nominations', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 1 ).create( newData )
			.then( award => {
				award.should.have.property( 'status', 'Nominated' );
				award.should.have.property( 'nominate', 1 );
				done();
			});
		});

		it( 'checks both prestige and vip roles for awards', function( done ) {
			let newHub = hub();
			newHub.hasOverUser = ( user, roles ) => {
				roles.should.be.an.Array().and.containDeep([ 'prestige_award', 'vip_award' ]);
				return Promise.resolve( true );
			};

			let newData = Object.assign( {}, data, { action: 'award', vip: 3 } );
			new VIPEndpoint( newHub, 1 ).create( newData )
			.then( () => done() );
		});

		it( 'sets the correct status for awards', function( done ) {
			let newData = Object.assign( {}, data, { action: 'award', vip: 3 } );
			new VIPEndpoint( hub(), 1 ).create( newData )
			.then( award => {
				award.should.have.property( 'status', 'Awarded' );
				award.should.have.property( 'awarder', 1 );
				done();
			});
		});

		it( 'sets the correct status for reductions', function( done ) {
			let newData = Object.assign( {}, data, { action: 'deduct', vip: -10 } );
			new VIPEndpoint( hub(), 1 ).create( newData )
			.then( award => {
				award.should.have.property( 'status', 'Awarded' );
				award.should.have.property( 'awarder', 1 );
				done();
			});
		});

		it( 'returns the correct data', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 1 ).create( newData )
			.then( award => {
				validateAward( award );
				let testObj = _.merge( newData, {
					status: 'Nominated',
					nominate: 1
				} );
				delete testObj.category;
				award.should.have.properties( testObj );
				done();
			});
		});

		it( 'does not create an action on request', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 2 ).create( newData )
			.then( award => new ActionModel().where({ awardId: award.id }).fetchAll() )
			.then( actions => {
				actions.toJSON().should.have.length( 0 );
				done();
			});
		});

		it( 'does create an action on nomination', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 1 ).create( newData )
			.then( award => new ActionModel().where({ awardId: award.id }).fetchAll() )
			.then( actions => {
				actions.toJSON().should.have.length( 1 );
				let action = actions.at( 0 ).toJSON();
				action.should.have.properties({
					action: 'Nominated',
					user: 1,
					office: 1
				});
				done();
			});
		});

		it( 'does create an action on awarding', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3, action: 'award' } );
			new VIPEndpoint( hub(), 1 ).create( newData )
			.then( award => new ActionModel().where({ awardId: award.id }).fetchAll() )
			.then( actions => {
				actions.toJSON().should.have.length( 1 );
				let action = actions.at( 0 ).toJSON();
				action.should.have.properties({
					action: 'Awarded',
					user: 1,
					office: 1
				});
				done();
			});
		});
	});

	describe( 'PUT /v1/vip/{id}', function() {

		beforeEach( 'reset data', resetDB );

		let data = {
			user: 2,
			category: 6,
			date: '2017-01-01',
			description: 'Test Award'
		};

		Object.keys( data ).forEach( key => {
			it( `fails without providing ${key}`, function( done ) {
				new VIPEndpoint( null, 1 ).update( 6, _.omit( data, key ) )
				.catch( err => {
					err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
					done();
				});
			});
		});

		Object.keys( data ).forEach( key => {
			if ( 'description' === key ) {
				return;
			}
			it( `fails with malformed ${key}`, function( done ) {
				let badData = _.set( _.clone( data ), key, 'bad!' );
				new VIPEndpoint( null, 1 ).update( 6, badData )
				.catch( err => {
					err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
					done();
				});
			});
		});

		it( 'fails if negative prestige set without deduct action', function( done ) {
			new VIPEndpoint( null, 1 ).update( 6, _.assign( {}, data, { vip: -10 } ) )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
				done();
			});
		});

		it( 'fails if saving with no prestige', function( done ) {
			new VIPEndpoint( null, 1 ).update( 6, data )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
				done();
			});
		});

		it( 'fails if trying to modify own approved award', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( null, 2 ).update( 6, newData )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.AuthError );
				done();
			});
		});

		it( 'works if trying to modify requested award', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( null, 2 ).update( 7, newData )
			.then( award => {
				award.should.have.properties({
					user: 2,
					status: 'Requested',
					vip: 3,
					usableVip: 3
				});
				done();
			});
		});

		it( 'checks both prestige and vip roles', function( done ) {
			let newHub = hub();
			newHub.hasOverUser = ( user, roles ) => {
				roles.should.be.an.Array().and.containDeep([ 'prestige_nominate', 'vip_nominate' ]);
				return Promise.resolve( true );
			};

			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( newHub, 1 ).update( 6, newData )
			.then( () => done() );
		});

		it( 'sets the correct status for nominations', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 1 ).update( 6, newData )
			.then( award => {
				award.should.have.property( 'status', 'Nominated' );
				award.should.have.property( 'nominate', 1 );
				done();
			});
		});

		it( 'checks both prestige and vip roles', function( done ) {
			let newHub = hub();
			newHub.hasOverUser = ( user, roles ) => {
				roles.should.be.an.Array().and.containDeep([ 'prestige_award', 'vip_award' ]);
				return Promise.resolve( true );
			};

			let newData = Object.assign( {}, data, { action: 'award', vip: 3 } );
			new VIPEndpoint( newHub, 1 ).update( 6, newData )
			.then( () => done() );
		});

		it( 'sets the correct status for awards', function( done ) {
			let newData = Object.assign( {}, data, { action: 'award', vip: 3 } );
			new VIPEndpoint( hub(), 1 ).update( 6, newData )
			.then( award => {
				award.should.have.property( 'status', 'Awarded' );
				award.should.have.property( 'awarder', 1 );
				done();
			});
		});

		it( 'sets the correct status for reductions', function( done ) {
			let newData = Object.assign( {}, data, { action: 'deduct', vip: -10 } );
			new VIPEndpoint( hub(), 1 ).update( 6, newData )
			.then( award => {
				award.should.have.property( 'status', 'Awarded' );
				award.should.have.property( 'awarder', 1 );
				done();
			});
		});

		it( 'returns the correct data', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 1 ).update( 6, newData )
			.then( award => {
				validateAward( award );
				let testObj = _.merge( newData, {
					status: 'Nominated',
					nominate: 1
				} );
				delete testObj.category;
				award.should.have.properties( testObj );
				done();
			});
		});

		it( 'does create an action on nomination', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3 } );
			new VIPEndpoint( hub(), 1 ).update( 6, newData )
			.then( award => new ActionModel().where({ awardId: award.id }).fetchAll() )
			.then( actions => {
				actions.toJSON().should.have.length( 2 );
				let action = actions.at( 1 ).toJSON();
				action.should.have.properties({
					action: 'Nominated',
					user: 1,
					office: 1
				});
				done();
			});
		});

		it( 'does create an action on awarding', function( done ) {
			let newData = Object.assign( {}, data, { vip: 3, action: 'award' } );
			new VIPEndpoint( hub(), 1 ).update( 7, newData )
			.then( award => new ActionModel().where({ awardId: award.id }).fetchAll() )
			.then( actions => {
				actions.toJSON().should.have.length( 1 );
				let action = actions.at( 0 ).toJSON();
				action.should.have.properties({
					action: 'Awarded',
					user: 1,
					office: 1
				});
				done();
			});
		});
	});

	describe( 'DELETE /v1/vip/{id}', function() {
		beforeEach( 'reset data', resetDB );

		it( 'throws when removing a non-existent award', function( done ) {
			new VIPEndpoint( null, 1 ).delete( 999 )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.NotFoundError );
				done();
			});
		});

		it( 'throws when removing an already removed award', function( done ) {
			new VIPEndpoint( null, 1 ).delete( 9 )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.RequestError );
				done();
			});
		});

		it( 'throws when removing with no offices', function( done ) {
			new VIPEndpoint( hub( 200, [] ), 3 ).delete( 6 )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.AuthError );
				done();
			});
		});

		it( 'throws when removing without permission', function( done ) {

			let hub = helpers.seriesHub([{ body: [{ id: 2 }] }, { statusCode: 403 }]);

			new VIPEndpoint( hub, 3 ).delete( 6 )
			.catch( err => {
				err.should.be.an.Error().and.be.an.instanceOf( errors.AuthError );
				done();
			});
		});

		it( 'works if requested by self', function( done ) {
			new VIPEndpoint( null, 1 ).delete( 7 )
			.then( award => {
				award.should.have.property( 'status', 'Removed' );
				done();
			});
		});

		it( 'works if officer nominated and award still nominated', function( done ) {
			new AwardModel({
				id: 10,
				user: 1,
				categoryId: 1,
				date: new Date( '2017-02-20' ),
				status: 'Nominated',
				nominate: 2,
				vip: 1,
				usableVip: 1
			}).save( {}, { method: 'insert' } )
			.then( () => {
				new VIPEndpoint( hub( 200, [{ id: 2 }] ), 3 ).delete( 10 )
				.then( award => {
					award.should.have.property( 'status', 'Removed' );
					done();
				});
			});
		});

		it( 'works if officer awarded', function( done ) {
			new AwardModel({
				id: 10,
				user: 1,
				categoryId: 1,
				date: new Date( '2017-02-20' ),
				status: 'Awarded',
				awarder: 2,
				vip: 1,
				usableVip: 1
			}).save( {}, { method: 'insert' } )
			.then( () => {
				new VIPEndpoint( hub( 200, [{ id: 2 }] ), 3 ).delete( 10 )
				.then( award => {
					award.should.have.property( 'status', 'Removed' );
					done();
				});
			});
		});

		it( 'works if have correct role', function( done ) {
			let hub = helpers.seriesHub(
				[{ body: [{ id: 2 }] },
				{ statusCode: 200 }]
			);
			new VIPEndpoint( hub, 2 ).delete( 6 )
			.then( award => {
				award.should.have.property( 'status', 'Removed' );
				done();
			});
		});

		it( 'updates DB to correct status', function( done ) {
			new VIPEndpoint( null, 1 ).delete( 7 )
			.then( () => new AwardModel({ id: 7 }).fetch() )
			.then( award => {
				award.toJSON().should.have.property( 'status', 'Removed' );
				done();
			});
		});

		it( 'creates an action entry', function( done ) {
			let hub = helpers.seriesHub(
				[{ body: [{ id: 2 }] },
				{ statusCode: 200, body: { offices: [{ id: 1 }] } }]
			);
			new VIPEndpoint( hub, 2 ).delete( 6, 'Test note' )
			.then( () => new ActionModel().where({ action: 'Removed' }).fetch() )
			.then( action => {
				action.toJSON().should.have.properties({
					awardId: 6,
					office: 1,
					user: 2,
					action: 'Removed',
					note: 'Test note'
				});
				done();
			});
		});
	});
}

function validateAward( award ) {
	award.should.have.properties([
		'id', 'description', 'source', 'date', 'modified',
		'nominate', 'awarder', 'general', 'regional',
		'national', 'vip', 'usableGeneral',
		'usableRegional', 'usableNational', 'usableVip'
	]);
	award.should.have.property( 'category' ).have.properties([
		'name', 'totalLimit', 'entryLimit'
	]);
}
