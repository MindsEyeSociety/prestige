const Bookshelf = require( '../helpers/db' ).Bookshelf;

const Category = require( './category' );

class Award extends Bookshelf.Model {
	get tableName() {
		return 'awards';
	}

	get hidden() {
		return [ 'categoryId', 'documentId', 'mcReviewId' ];
	}

	document() {
		return this.belongsTo( 'Document', 'documentId' );
	}

	actions() {
		return this.hasMany( 'Action', 'awardId' );
	}

	mc() {
		return this.belongsTo( 'MC', 'mc' );
	}

	category() {
		return this.belongsTo( Category, 'categoryId' );
	}
}

module.exports = Bookshelf.model( 'Award', Award );
