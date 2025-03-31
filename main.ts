Bun.serve({
    idleTimeout: 240,
    port: 3000,
    routes: {
        '/': { GET },
    },
});

async function GET(req: Request): Promise<Response> {
    const code = new URL(req.url).searchParams.get('code');
    const res = code ? await callback(code) : login();
    return res;
}

async function callApi(token: string, endpoint: string, method = 'get', body?: object) {
    const headers = { authorization: `Bearer ${token}` };
    const url = `https://api.spotify.com/v1${endpoint}`;

    const res = await fetch(url, { body: JSON.stringify(body), headers, method });
    if (!res.ok && res.status === 429) throw Error('Too many requests.');
    if (!res.ok) throw Error('Unable to retrieve data.');
    const json = await res.json();
    return json;
}

async function callback(code: string): Promise<Response> {
    try {
        const { access_token: token } = await getToken(code);
        const following = await getFollowing(token);
        const releases = await getReleases(token, following);
        const tracks = await getTracks(token, releases);
        await postTracks(token, tracks);
    } catch (err) {
        return new Response(String(err), { status: 500 });
    }

    return new Response('Sync complete.');
}

async function getFollowing(token: string): Promise<{ id: string; name: string }[]> {
    const following = [];
    let next = '/me/following?limit=50&type=artist';

    do {
        const { artists } = await callApi(token, next);
        next = artists.next?.slice(artists.next?.indexOf('/me/following'));

        for (const { id, name } of artists.items) {
            if (id && name) following.push({ id, name });
        }
    } while (Bun.env.ENVIRONMENT !== 'dev' && next);

    following.sort((a, b) => a.name.localeCompare(b.name));
    return following;
}

async function getReleases(token: string, following: { id: string }[]): Promise<string[]> {
    const releases = [];
    const [start, end] = getDateRange();

    for (const { id: artist } of following) {
        const endpoint1 = `/artists/${artist}/albums?include_groups=single&limit=20`;
        const { items: singles } = await callApi(token, endpoint1);

        for (const { id: single, release_date: date } of singles) {
            if (start <= date && date <= end) releases.push(single);
        }

        const endpoint2 = `/artists/${artist}/albums?include_groups=album&limit=10`;
        const { items: albums } = await callApi(token, endpoint2);

        for (const { id: album, name, release_date: date } of albums) {
            if (name.includes('A State of Trance')) continue;
            if (name.includes('Group Therapy')) continue;
            if (start <= date && date <= end) releases.push(album);
        }
    }

    return releases;
}

async function getToken(code: string) {
    const URL = 'https://accounts.spotify.com/api/token';
    const headers = { 'content-type': 'application/x-www-form-urlencoded' };

    const body = new URLSearchParams({
        client_id: Bun.env.CLIENT_ID!,
        client_secret: Bun.env.CLIENT_SECRET!,
        code,
        grant_type: 'authorization_code',
        redirect_uri: Bun.env.REDIRECT_URI!,
    });

    const res = await fetch(URL, { body, headers, method: 'post' });
    if (!res.ok) throw Error('Unable to retrieve token.');
    const json = await res.json();
    return json;
}

async function getTracks(token: string, releases: string[]): Promise<string[]> {
    const tracks = [];

    for (const release of releases) {
        const res = await callApi(token, `/albums/${release}/tracks?limit=50`);

        for (const { uri } of res.items) {
            tracks.push(uri);
        }
    }

    return tracks;
}

async function postTracks(token: string, tracks: string[]): Promise<void> {
    const playlists = await callApi(token, '/me/playlists');
    let playlist = '';

    for (const { id, name } of playlists.items) {
        if (name === 'Listening') playlist = id;
    }

    while (tracks.length) {
        const uris = tracks.splice(0, 100);
        await callApi(token, `/playlists/${playlist}/tracks`, 'post', { uris });
    }
}

function getDateRange(): [string, string] {
    const date = new Date;
    while (date.getDay() !== 5) date.setDate(date.getDate() - 1);
    const end = date.toISOString().slice(0, 10);
    date.setDate(date.getDate() - 6);
    const start = date.toISOString().slice(0, 10);
    return [start, end];
}

function login(): Response {
    const URL = 'https://accounts.spotify.com/authorize';
    const scope = ['playlist-modify-private', 'playlist-read-private', 'user-follow-read'];
    const state = Math.random().toString(36).slice(0, 8) + Math.random().toString(36).slice(0, 8);

    const params = new URLSearchParams({
        client_id: Bun.env.CLIENT_ID!,
        redirect_uri: Bun.env.REDIRECT_URI!,
        response_type: 'code',
        scope: scope.join(' '),
        state,
    });

    return Response.redirect(`${URL}?${params}`);
}
