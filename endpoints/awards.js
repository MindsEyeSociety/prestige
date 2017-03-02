'use strict';

const _       = require( 'lodash' );
const Promise = require( 'bluebird' );

const AwardModel    = require( '../models/award' );
const CategoryModel = require( '../models/category' );
const RequestError  = require( '../helpers/errors' ).RequestError;

class AwardsEndpoint {

	/**
	 * Constructor.
	 * @param {Object} hub  The Hub interface.
	 * @param {Number} user The user ID.
	 * @return {AwardsEndpoint}
	 */
	constructor( hub, user ) {
		this.Hub    = hub;
		this.userId = user;
		this.levels = [ 'general', 'regional', 'national'  ];
		return this;
	}


	/**
	 * Gets awards.
	 * @param {Object} filters Filter object.
	 * @return {Promise}
	 */
	get( filters ) {
		// Sets the default filter data.
		if ( ! _.has( filters, 'status' ) ) {
			filters.status = 'Awarded';
		}

		// Either we're looking at approved awards, or we're National.
		let promise;
		if (  'Awarded' === filters.status ) {
			promise = Promise.resolve();
		} else {
			promise = this.Hub.hasOverOrgUnit( 1, 'prestige_view' );
		}

		// Get the data.
		return promise
		.then( () => this.filterAwards( filters ) )
		.then( awards => awards.toJSON() );
	}


	/**
	 * Gets awards for a given member.
	 * @param {String|Number} user    The user ID.
	 * @param {Object}        filters Filter object.
	 * @return {Promise}
	 */
	getMember( user, filters ) {
		// Sets the default filter data.
		if ( ! _.has( filters, 'status' ) ) {
			filters.status = 'Awarded';
		}
		filters.user = user;

		// Check for public or personal information, otherwise do a role check.
		let promise;
		if (
			'Awarded' === filters.status ||
			'me' === user ||
			Number.parseInt( user ) === this.userId
		) {
			promise = Promise.resolve( true );
		} else {
			promise = this.Hub.hasOverUser( user, 'prestige_view' );
		}

		// Get the data.
		return promise
		.then( () => this.filterAwards( filters ) )
		.then( awards => awards.toJSON() );
	}


	/**
	 * Creates an award.
	 * @param {Object} data Data to create from.
	 * @return {Promise}
	 */
	create( data ) {
		return this.validateAward( data )
		.tap( data => {
			if ( 'request' === data.action ) {
				return;
			}
			return this.Hub.hasOverUser( data.user, `prestige_${data.action}_${data.level}` );
		})
		.then( data => _.omit( data, [ 'action', 'level' ] ) )
		.then( data => new AwardModel( data ).save() )
		.then( award => award.refresh({ withRelated: [ 'category' ] }) );
	}


	/**
	 * Updates an award.
	 * @param {Number} id   ID of award of update.
	 * @param {Object} data Data to update.
	 * @return {Promise}
	 */
	update( id, data ) {
		return this.validateAward( data );
	}


	/**
	 * Deletes an award.
	 * @param {Number} id ID of award to remove.
	 * @return {Promise}
	 */
	delete( id ) {
		new AwardModel({ id: id }).delete();
	}


	/**
	 * Filters a group of awards.
	 * @param {Object}     filter The filter object.
	 * @param {AwardModel} query  Optional. The Bookshelf Award model.
	 * @return {Promise}          Filtered Award model promise.
	 */
	filterAwards( filter, query ) {
		if ( ! query ) {
			query = new AwardModel();
		}

		filter = _.defaults( filter, {
			limit: 20,
			offset: 0,
			status: 'Awarded'
		});

		if ( 'all' !== filter.status ) {
			query.where( 'status', filter.status );
		}

		if ( filter.user ) {
			if ( 'me' === filter.user ) {
				filter.user = this.userId;
			}
			query.where( 'user', filter.user );
		}
		if ( filter.category ) {
			query.where( 'categoryId', filter.category );
		}
		if ( filter.source ) {
			query.where( 'source', 'LIKE', `%${filter.source}%` );
		}
		if ( filter.description ) {
			query.where( 'description', 'LIKE', `%${filter.description}%` );
		}
		if ( filter.awarder ) {
			query.where( 'awarder', filter.awarder );
		}
		if ( filter.nominate ) {
			query.where( 'nominate', filter.nominate );
		}
		if ( filter.dateBefore && NaN !== Date.parse( filter.dateBefore ) ) {
			query.where( 'date', '<', new Date( filter.dateBefore ) );
		}
		if ( filter.dateAfter && NaN !== Date.parse( filter.dateAfter ) ) {
			query.where( 'date', '>=', new Date( filter.dateAfter ) );
		}

		return query.fetchPage({
			limit: Math.min( filter.limit, 100 ),
			offset: filter.offset,
			withRelated: [ 'category' ]
		});
	}


	/**
	 * Validates award data.
	 * @param {Object} data Award data.
	 * @return {Promise}
	 */
	validateAward( data ) {
		const validate = require( '../helpers/validation' );

		let constraints = {
			user: { presence: true, numericality: { onlyInteger: true } },
			category: { presence: true, numericality: { onlyInteger: true } },
			date: { presence: true, date: true },
			action: { presence: true, inclusion: [ 'request', 'nominate', 'award', 'deduct' ] },
			description: { presence: true },
			source: {}
		};

		let constaint = { numericality: { onlyInteger: true, greaterThanOrEqualTo: 0 } };
		this.levels.forEach( level => {
			constraints[ level ] = constaint;
			if ( 'award' === data.action ) {
				constraints[ 'usable' + _.capitalize( level ) ] = constaint;
			}
		});

		// Sets the user for self.
		if ( 'me' === data.user ) {
			data.user = this.userId;
		}

		// Force the type of action.
		if ( Number.parseInt( data.user ) === this.userId ) {
			data.action = 'request';
		} else if ( ! data.action ) {
			data.action = 'nominate';
		}

		if ( 'deduct' === data.action ) {
			this.levels.forEach( level => {
				delete constraints[ level ].numericality.greaterThanOrEqualTo;
				constraints[ level ].numericality.lessThanOrEqualTo = 0;
			});
		}

		// Validate and clean up.
		let errors = validate( data, constraints );
		if ( errors ) {
			return Promise.reject( new RequestError( `Errors found: ${errors.join( ', ' )}` ) );
		}

		data = validate.cleanAttributes( data, constraints );

		// Exit if no prestige is set.
		let prestige = false
		this.levels.forEach( level => {
			if ( data[ level ] ) {
				prestige = true;
			}
		});
		if ( ! prestige ) {
			return Promise.reject( new RequestError( 'No prestige awarded' ) );
		}

		// Sets the correct status.
		if ( 'request' === data.action ) {
			data.status = 'Requested';
		} else if ( 'nominate' === data.action ) {
			data.status = 'Nominated';
		} else {
			data.status = 'Awarded';
		}

		// Checks if the category exists.
		return new CategoryModel({ id: data.category })
		.where( 'start', '<', data.date )
		.query( qb => {
			qb.where( function() {
				this.where( 'end', '>=', data.date ).orWhereNull( 'end' );
			});
		})
		.fetch({ required: true })
		.catch( () => {
			throw new RequestError( 'Invalid category ID' );
		})
		.then( category => {
			category = category.toJSON();
			data.categoryId = category.id;
			delete data.category;

			this.levels.forEach( level => {
				let key = 'usable' + _.capitalize( level );
				if ( data[ level ] ) {
					let cur = data[ key ] || data[ level ];
					data[ key ] = Math.min( category.entryLimit, cur );
					data.level = level;
				}
			});

			return data;
		});
	}

	/**
	 * Express routing helper.
	 */
	static route() {
		let router = require( 'express' ).Router();
		let hub    = require( '../helpers/hub' ).route;

		router.get( '/',
			hub,
			( req, res, next ) => {
				return new AwardsEndpoint( req.hub, req.user )
				.get( req.query )
				.then( awards => res.json({ results: awards }) )
				.catch( err => next( err ) );
			}
		);

		router.get( '/member/:user',
			hub,
			( req, res, next ) => {
				return new AwardsEndpoint( req.hub, req.user )
				.getMember( req.params.user, req.query )
				.then( awards => res.json({ results: awards }) )
				.catch( err => next( err ) );
			}
		);

		router.post( '/',
			hub,
			( req, res, next ) => {
				return new AwardsEndpoint( req.hub, req.user )
				.create( req.body )
				.then( award => res.json( award ) )
				.catch( err => next( err ) );
			}
		);

		return router;
	}
}

module.exports = AwardsEndpoint;
