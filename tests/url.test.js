const request = require('supertest');
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const express = require('express');
const urlRoutes = require('../src/routes/urlRoutes');
const Url = require('../src/models/Url');

jest.setTimeout(30000);

let mongod;
let app;

beforeAll(async () => {
	mongod = await MongoMemoryServer.create();
	const uri = mongod.getUri();
	await mongoose.connect(uri);

	app = express();
	app.use(express.json());
	app.use('/api', urlRoutes);
	app.use('/', urlRoutes);
});

afterEach(async () => {
	await Url.deleteMany({});
});

afterAll(async () => {
	await mongoose.disconnect();
	if (mongod) await mongod.stop();
});

describe('Link Shortener APIs', () => {
	it('POST /api/shorten returns 201 with originalUrl, shortId (8), shortUrl', async () => {
		const res = await request(app)
			.post('/api/shorten')
			.send({ originalUrl: 'https://example.com' })
			.set('Content-Type', 'application/json');

		expect(res.status).toBe(201);
		expect(res.body).toHaveProperty('originalUrl', 'https://example.com');
		expect(res.body).toHaveProperty('shortId');
		expect(typeof res.body.shortId).toBe('string');
		expect(res.body.shortId).toHaveLength(8);
		expect(res.body).toHaveProperty('shortUrl');
		expect(typeof res.body.shortUrl).toBe('string');
		expect(res.body.shortUrl).toMatch(/http:\/\/localhost:\d+\/[A-Za-z0-9_-]{8}/);
	});

	it('POST /api/shorten with missing originalUrl returns 400', async () => {
		const res = await request(app)
			.post('/api/shorten')
			.send({})
			.set('Content-Type', 'application/json');

		expect(res.status).toBe(400);
		expect(res.body).toEqual({ error: 'originalUrl is required' });
	});

	it('GET /:shortId redirects to originalUrl with 302', async () => {
		// create first
		const create = await request(app)
			.post('/api/shorten')
			.send({ originalUrl: 'https://example.com' })
			.set('Content-Type', 'application/json');
		const { shortId, originalUrl } = create.body;

		const res = await request(app)
			.get(`/${shortId}`)
			.redirects(0); // don't follow

		expect(res.status).toBe(302);
		expect(res.headers).toHaveProperty('location', originalUrl);
	});

	it('GET /:shortId with invalid/nonexistent id returns 404', async () => {
		const res = await request(app)
			.get('/notfoundid')
			.redirects(0);

		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'URL not found' });
	});

	it('GET /:shortId increments clicks and adds visit log', async () => {
		// create first
		const create = await request(app)
			.post('/api/shorten')
			.send({ originalUrl: 'https://example.com' })
			.set('Content-Type', 'application/json');
		const { shortId } = create.body;

		// visit the short URL
		await request(app)
			.get(`/${shortId}`)
			.set('User-Agent', 'Test Browser')
			.redirects(0);

		// check analytics
		const analytics = await request(app)
			.get(`/api/analytics/${shortId}`);

		expect(analytics.status).toBe(200);
		expect(analytics.body).toHaveProperty('totalClicks', 1);
		expect(analytics.body).toHaveProperty('visitLogs');
		expect(analytics.body.visitLogs).toHaveLength(1);
		expect(analytics.body.visitLogs[0]).toHaveProperty('timestamp');
		expect(analytics.body.visitLogs[0]).toHaveProperty('userAgent', 'Test Browser');
		expect(analytics.body.visitLogs[0]).toHaveProperty('ip');
	});

	it('GET /api/analytics/:shortId returns 404 for nonexistent shortId', async () => {
		const res = await request(app)
			.get('/api/analytics/notfoundid');

		expect(res.status).toBe(404);
		expect(res.body).toEqual({ error: 'URL not found' });
	});

	it('Multiple visits increment clicks correctly', async () => {
		// create first
		const create = await request(app)
			.post('/api/shorten')
			.send({ originalUrl: 'https://example.com' })
			.set('Content-Type', 'application/json');
		const { shortId } = create.body;

		// visit 3 times
		for (let i = 0; i < 3; i++) {
			await request(app)
				.get(`/${shortId}`)
				.redirects(0);
		}

		// check analytics
		const analytics = await request(app)
			.get(`/api/analytics/${shortId}`);

		expect(analytics.status).toBe(200);
		expect(analytics.body).toHaveProperty('totalClicks', 3);
		expect(analytics.body).toHaveProperty('visitLogs');
		expect(analytics.body.visitLogs).toHaveLength(3);
	});
});



