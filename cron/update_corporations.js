module.exports = {
    exec: f,
    span: 1
}

const entity = require('../classes/entity.js');

async function f(app) {
    let promises = [];

    let corps = await app.mysql.query('select corporation_id from ew_corporations where corporation_id > 0 and memberCount > 0 and lastUpdated < date_sub(now(), interval 1 day) order by lastUpdated limit 1');
    for (let i = 0; i < corps.length; i++ ){
        if (app.pause420 == true) break;
        if (app.error_count > 0) break;
        if (app.util.isDowntime()) break;

        let row = corps[i];
        let corp_id = row.corporation_id;
        await app.mysql.query('update ew_corporations set lastUpdated = now() where corporation_id = ?', corp_id);
        if (await app.redis.set('check:' + corp_id, corp_id, 'nx', 'ex', 300) == null) continue;

        let url = 'https://esi.evetech.net/v5/corporations/' + corp_id + '/';
console.log('corp', corp_id);
        promises.push(app.phin(url).then(res => { parse(app, res, corp_id, url); }).catch(e => { failed(e, corp_id); }));

        //let sleep = 300 + (app.error_count * 1000);
        //await app.sleep(sleep); // Limit to 10/s + time for errors
    }

    //await Promise.all(promises).catch();
}

async function parse(app, res, corp_id, url) {
    try {
        if (res.statusCode == 200) {
            var body = JSON.parse(res.body);
            //console.log('Updating corp ' + corp_id);

            let r = await app.mysql.query('update ew_corporations set alliance_id = ?, faction_id = ?, ceoID = ?, memberCount = ?, name = ?, ticker = ?, taxRate = ? where corporation_id = ?', [body.alliance_id || 0, body.faction_id || 0, body.ceo_id || 0, body.memberCount || 0, body.name, body.ticker, body.tax_rate || 0, corp_id]);
            if (r.changedRows > 0) {
                await app.mysql.query('update ew_corporations set recalc = 1, lastUpdated = now() where corporation_id = ?', [corp_id]);
            } else {
                await app.mysql.query('update ew_corporations set lastUpdated = now() where corporation_id = ?', [corp_id]);
            }
            await entity.add(app, 'alli', body.alliance_id);
            await entity.add(app, 'char', body.creator_id);
            await entity.add(app, 'char', body.ceo_id);
        } else {
            app.error_count++;
            if (res.statusCode != 502) console.log(res.statusCode + ' ' + url);
            setTimeout(function() { app.error_count--; }, 1000);

            if (res.statusCode == 420) {
                app.pause420 = true;
                await app.sleep(120000);
                app.pause420 = false;
            }
        }
    } catch (e) { 
        console.log(url + ' ' + e);
    }
}

async function failed(e, corp_id) {
    console.log(e);
}
