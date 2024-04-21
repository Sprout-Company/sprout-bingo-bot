const Index = ()=> {
  const {
    Telegraf,
    Markup
  } = require('telegraf');

  const Bingo = require('./modules/bingo.js');
  const result = require('./modules/result.js')
  const table = require('./modules/table.js');
  const client = require ('./modules/client_v1.js');
  const lang_data = require('./modules/lang.js');
  const cronos = require('./modules/cronos.js')
  const config = require('./../config.js');
  const connectDB = require('./DB/db.js')
  //(async function() {
  connectDB();
  //  })();
  const User = require('./DB/models/User.js')

  client.hostConfig(config.CLIENT_V1_HOST)
  client.setAuthToken(config.CLIENT_V1_TOKEN);
  const bot = new Telegraf(config.BOT_TOKEN);
  result.setBot(bot)
  const lang = (data)=> {
    let userLang = data.from ? data.from.languague_code: data.message ? data.message.user.lang: data;
    if (userLang == 'es') {
      return lang_data.es;
    } else {
      return lang_data.en;
    }
  }
  const bingo_data = {
    boto: ['mini',
      'mega',
      'super'],
    name: {
      "1": "🥇 MiniLotto 1spc 🥇",
      "10": "🎖 SuperLotto 10spc ",
      "100": "🏆 MegaLotto 100spc 🏆",
    },
    priceOf: (ticket)=> {
      const min = 1,
      meg = 10,
      sup = 100;
      return ticket != 'ticket_mega' ? ticket != "ticket_super" ? ticket != "ticket_mini" ? 0: min: meg: sup;
    }
  }

  const bingo = {
    ticket_mini: new Bingo(bingo_data.boto[0]),
    ticket_super: new Bingo(bingo_data.boto[1]),
    ticket_mega: new Bingo(bingo_data.boto[2]),
  }

  const checkStatus = async (ctx)=> {
    const chatId = ctx.chat.id;
    const msg = await ctx.reply(lang(ctx).check)
    const data = await client.getUserData(chatId)
    switch (data.status) {
      case 'ERROR':
        switch (data.message) {
        case 'USER_NOT_FOUND':
          let {
            inline,
            text
          } = lang(ctx).start.USER_NOT_FOUND;
          let key = inline;
          key.push([{
            text: 'SproutComp', url: `https://www.sproutcomp.pro/auth/telegram/${chatId}`
          }])
          bot.telegram.deleteMessage(msg.chat.id, msg.message_id)
          return await ctx.reply(text, Markup.inlineKeyboard(key));
        default:
          bot.telegram.deleteMessage(msg.chat.id, msg.message_id)
          return await ctx.reply(lang(ctx).start.NOT_FOUND.text);
        }
      case 'SUCCESS':
        let {
          keyboard,
          text
        } = lang(data).start.SUCCESS;
        bot.telegram.deleteMessage(msg.chat.id, msg.message_id)
        return await ctx.reply(text, Markup.keyboard(keyboard).resize());
    }
  }

  bot.start(async (ctx) => {
    await checkStatus(ctx);
    let user = await User.findOne({
      id: ctx.chat.id
    })
    if (!user) {
      user = new User({
        id: ctx.chat.id
      })
    }
    user.save();
  });
  bot.action("check_status",
    async (ctx) => await checkStatus(ctx))

  bot.hears('🎲 Jugar',
    async (ctx) => {
      const chatId = ctx.chat.id;
      const data = await client.getUserData(chatId);
      if (data.status == 'SUCCESS') {
        const {
          text,
          inline
        } = lang(data).play
        ctx.deleteMessage(ctx.message.message_id);
        return await ctx.reply(text, Markup.inlineKeyboard(inline))
      } else {
        await existUser(chatId);
      }
    });

  bot.action(/ticket_.*/,
    async (ctx) => {
      const [chatId,
        ticket] = [ctx.chat.id,
        ctx.match[0]];
      let msg = ''
      const user = await User.findOne({
        id: chatId
      })
      const data = await client.getUserData(chatId);
      const info = await bingo[ticket].getInfo();
      const price = bingo_data.priceOf(ticket);
      const name = bingo_data.name[price];
      if (data.message.wallet.sprout_coins >= price) {
        user.betCoin = price;
        user.ticket = ticket;
        user.save();
        let bonus = info.bonus == 0 || info.bonus == null ? ((price / 100) * 75) + price: info.bonus;
        msg = lang_data.valueJson(lang(data).play.text_selection, {
          1: name,
          2: bonus
        });
        return await ctx.editMessageText(msg,
          Markup.inlineKeyboard(table(info.data.numbers)))
      } else {
        msg = lang_data.valueJson(lang(data).play.not_coin,
          {
            1: price,
            2: data.message.wallet.sprout_coins
          });
        return await ctx.editMessageText(msg)
      }
    });

  bot.action(/num_.*/,
    async (ctx)=> {
      let num = ctx.match[0].split("_")[1],
      msg = '';
      const chatId = ctx.chat.id;
      let data = await client.getUserData(chatId);
      const user = await User.findOne({
        id: chatId
      })
      user.betNumber = num;
      user.save();
      msg = lang_data.valueJson(lang(data).play_confirm.text,
        {
          1: num,
          2: bingo_data.name[user.betCoin],
          3: data.message.wallet.sprout_coins
        });
      return await ctx.editMessageText(msg,
        Markup.inlineKeyboard(lang(data).play_confirm.inline))
    })

  bot.action('bet_yes',
    async (ctx) => {
      let chatId = ctx.chat.id,
      msg = '';
      const user = await User.findOne({
        id: chatId
      })
      const data = await client.getUserData(chatId)
      const coin = user.betCoin,
      number = user.betNumber,
      ticket = user.ticket;
      await client.sproutCoins(chatId, data.message.wallet.sprout_coins - coin)
      let bet = await bingo[ticket].bet(chatId, number, coin);
      if (bet) {
        msg = lang_data.valueJson(lang(data).bet_yes.text_ok, {
          1: coin,
          2: data.message.wallet.sprout_coins - coin,
        })
      } else {
        msg = lang(data).bet_yes.text_bad
      }
      return await ctx.editMessageText(msg);
    });

  bot.action('bet_not',
    async (ctx) => {
      let chatId = ctx.chat.id,
      msg = '';
      const data = await client.getUserData(chatId)
      msg = lang(data).bet_not.text;
      return await ctx.editMessageText(msg)
    });

  bot.hears('💲 SproutCoin',
    async (ctx) => {
      const chatId = ctx.chat.id;
      ctx.deleteMessage(ctx.message.message_id);
      return await ctx.reply('Opción no disponible');
    });

  bot.hears('Apuestas 📜',
    async (ctx) => {
      let chatId = ctx.chat.id;
      let msg = '';
      for (let i in bingo) {
        let bin = await bingo[i].getInfo();
        //  if (bin.data.users[chatId] != null) {
        msg += JSON.stringify(bin.data)
        // }
      }
      await ctx.deleteMessage(ctx.message.message_id);
      return await ctx.reply(msg)
    });

  bot.hears('Ajustes ⚙️',
    async (ctx) => {
      await ctx.deleteMessage(ctx.message.message_id);
      return await ctx.reply('Opción no disponible')
    });
  const startResult = async () => {
    await result.start(bingo,
      (winner)=> {
        console.log(winner)
      },
      (losers)=> {
        console.log(losers)
      });
    let p = -1;
    for (let i in bingo_data.boto) {
      p++;
      bingo[i] = new Bingo(bingo_data.boto[p])
    }
  };
  bot.command('res',
    async (ctx)=> {
      await startResult();
    })
  bot.command('sc',
    async (ctx)=> {
      let dat = await client.sproutCoins(ctx.chat.id, 9999)
      return await ctx.reply(JSON.stringify(dat));
    })
  bot.on('text',
    async (ctx) => {
      const chatId = ctx.chat.id;
      return await ctx.deleteMessage(ctx.message.message_id);
    });
  (async()=> {
    await cronos(0, async()=> {
     await startResult();
    })
  })();
  bot.launch();
}
module.exports = Index;