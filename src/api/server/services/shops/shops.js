import { ObjectID } from 'mongodb';
import url from 'url';
import { db } from '../../lib/mongo';
import utils from '../../lib/utils';
import parse from '../../lib/parse';
import SettingsService from '../settings/settings';

const DEFAULT_SORT = { is_system: -1, date_created: 1 };

class shopsService {
	constructor() {}

	getFilter(params = {}) {
		let filter = {};
		const id = parse.getObjectIDIfValid(params.id);
		const tags = parse.getString(params.tags);
		if (id) {
			filter._id = new ObjectID(id);
		}
		if (tags && tags.length > 0) {
			filter.tags = tags;
		}
		return filter;
	}

	getSortQuery({ sort }) {
		if (sort && sort.length > 0) {
			const fields = sort.split(',');
			return Object.assign(
				...fields.map(field => ({
					[field.startsWith('-') ? field.slice(1) : field]: field.startsWith(
						'-'
					)
						? -1
						: 1
				}))
			);
		} else {
			return DEFAULT_SORT;
		}
	}

	async getshops(params = {}) {
		const filter = this.getFilter(params);
		const sortQuery = this.getSortQuery(params);
		const projection = utils.getProjectionFromFields(params.fields);
		const generalSettings = await SettingsService.getSettings();
		const domain = generalSettings.domain;
		const items = await db
			.collection('shops')
			.find(filter, { projection: projection })
			.sort(sortQuery)
			.toArray();
		const result = items.map(shop => this.changeProperties(shop, domain));
		return result;
	}

	getSingleShop(id) {
		if (!ObjectID.isValid(id)) {
			return Promise.reject('Invalid identifier');
		}
		return this.getshops({ id: id }).then(shops => {
			return shops.length > 0 ? shops[0] : null;
		});
	}

	addShop(data) {
		return this.getValidDocumentForInsert(data).then(shop =>
			db
				.collection('shops')
				.insertMany([shop])
				.then(res => this.getSingleShop(res.ops[0]._id.toString()))
		);
	}

	updateShop(id, data) {
		if (!ObjectID.isValid(id)) {
			return Promise.reject('Invalid identifier');
		}
		const pageObjectID = new ObjectID(id);

		return this.getValidDocumentForUpdate(id, data).then(shop =>
			db
				.collection('shops')
				.updateOne({ _id: pageObjectID }, { $set: shop })
				.then(res => this.getSingleShop(id))
		);
	}

	deleteShop(id) {
		if (!ObjectID.isValid(id)) {
			return Promise.reject('Invalid identifier');
		}
		const pageObjectID = new ObjectID(id);
		return db
			.collection('shops')
			.deleteOne({ _id: pageObjectID, is_system: false })
			.then(deleteResponse => {
				return deleteResponse.deletedCount > 0;
			});
	}

	getValidDocumentForInsert(data) {
		let shop = {
			is_system: false,
			date_created: new Date()
		};

		shop.content = parse.getString(data.content);
		shop.meta_description = parse.getString(data.meta_description);
		shop.meta_title = parse.getString(data.meta_title);
		shop.enabled = parse.getBooleanIfValid(data.enabled, true);
		shop.tags = parse.getArrayIfValid(data.tags) || [];

		let slug =
			!data.slug || data.slug.length === 0 ? data.meta_title : data.slug;
		if (!slug || slug.length === 0) {
			return Promise.resolve(shop);
		} else {
			return utils.getAvailableSlug(slug, null, false).then(newSlug => {
				shop.slug = newSlug;
				return shop;
			});
		}
	}

	getValidDocumentForUpdate(id, data) {
		if (Object.keys(data).length === 0) {
			return Promise.reject('Required fields are missing');
		} else {
			return this.getSingleshop(id).then(prevShopData => {
				let shop = {
					date_updated: new Date()
				};

				if (data.content !== undefined) {
					shop.content = parse.getString(data.content);
				}

				if (data.meta_description !== undefined) {
					shop.meta_description = parse.getString(data.meta_description);
				}

				if (data.meta_title !== undefined) {
					shop.meta_title = parse.getString(data.meta_title);
				}

				if (data.enabled !== undefined && !prevShopData.is_system) {
					shop.enabled = parse.getBooleanIfValid(data.enabled, true);
				}

				if (data.tags !== undefined) {
					shop.tags = parse.getArrayIfValid(data.tags) || [];
				}

				if (data.slug !== undefined && !prevShopData.is_system) {
					let slug = data.slug;
					if (!slug || slug.length === 0) {
						slug = data.meta_title;
					}

					return utils.getAvailableSlug(slug, id, false).then(newSlug => {
						shop.slug = newSlug;
						return shop;
					});
				} else {
					return shop;
				}
			});
		}
	}

	changeProperties(item, domain) {
		if (item) {
			item.id = item._id.toString();
			item._id = undefined;

			if (!item.slug) {
				item.slug = '';
			}

			item.url = url.resolve(domain, `/${item.slug}`);
			item.path = url.resolve('/', item.slug);
		}

		return item;
	}
}

export default new shopsService();
