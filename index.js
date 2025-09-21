const { Client, GatewayIntentBits, Partials, EmbedBuilder, PermissionsBitField } = require('discord.js');
const mongoose = require('mongoose');
const config = require('./config.json');

const prefix = config.prefix;
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

mongoose.connect(config.mongoURL, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('✅ تم الاتصال بقاعدة البيانات'))
  .catch(err => console.error('❌ خطأ في الاتصال بقاعدة البيانات:', err));

const LevelSchema = new mongoose.Schema({
  userID: String,
  guildID: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 }
});
const Level = mongoose.model('Level', LevelSchema);

const GuildSchema = new mongoose.Schema({
  guildID: String,
  levelUpChannel: { type: String, default: "Default" }
});
const GuildConfig = mongoose.model('GuildConfig', GuildSchema);

const BlacklistSchema = new mongoose.Schema({
  guildID: String,
  type: String,
  MID: String
});
const Blacklist = mongoose.model('Blacklist', BlacklistSchema);

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const UBLC = await Blacklist.findOne({ guildID: message.guild.id, type: "User", MID: message.author.id });
  const CBLC = await Blacklist.findOne({ guildID: message.guild.id, type: "Channel", MID: message.channel.id });
  if (UBLC || CBLC) return;

  const xpGain = Math.floor(Math.random() * 10) + 5;
  let UDB = await Level.findOne({ userID: message.author.id, guildID: message.guild.id });
  if (!UDB) {
    UDB = new Level({ userID: message.author.id, guildID: message.guild.id });
  }

  UDB.xp += xpGain;
  const Lxp = UDB.level * 100;

  if (UDB.xp >= Lxp) {
    UDB.level++;
    UDB.xp = 0;

    try {
      const LVSF = `🔥 ${UDB.level}`;
      const Care = message.member.displayName.replace(/ 🔥 \d+$/, "");
      const Park = `${Care} ${LVSF}`;
      await message.member.setNickname(Park).catch(() => { });
    } catch (err) {
      console.error(`فشل تغيير النك نيم للعضو ${message.author.tag}:`, err.message);
    }

    let GDB = await GuildConfig.findOne({ guildID: message.guild.id });
    if (!GDB) {
      GDB = new GuildConfig({ guildID: message.guild.id });
    }

    const channelID = GDB.levelUpChannel === "Default" ? message.channel.id : GDB.levelUpChannel;
    const levelChannel = message.guild.channels.cache.get(channelID);

    if (levelChannel) {
      const embed = new EmbedBuilder()
        .setColor('#ff6600')
        .setAuthor({
          name: message.author.username,
          iconURL: message.author.displayAvatarURL({ dynamic: true })
        })
        .setTitle('مستوى جديد')
        .setThumbnail(message.guild.iconURL())
        .setDescription(
          `مبروك <@${message.author.id}>! لقد وصلت إلى مستوى جديد\n\n` +
          `**المستوى الحالي:** ${UDB.level}\n` +
          `**السيرفر:** ${message.guild.name}`
        )
        .addFields(
          { name: 'تاريخ الترقية', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
        )
        .setFooter({ text: client.user.username, iconURL: client.user.displayAvatarURL() });

      await levelChannel.send({
        content: `<@${message.author.id}>`,
        embeds: [embed]
      });
    }
  }

  await UDB.save();
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (message.content.startsWith(prefix + "level")) {
    const UDB = await Level.findOne({ userID: message.author.id, guildID: message.guild.id });
    if (!UDB) {
      return message.reply('لم يتم العثور على بياناتك بعد، ابدأ بالمشاركة للحصول على XP');
    }

    const Lxp = UDB.level * 100;
    const progress = Math.min((UDB.xp / Lxp) * 10, 10);
    const XP = "🟩".repeat(progress) + "⬜".repeat(10 - progress);

    const embed = new EmbedBuilder()
      .setColor('#3498db')
      .setAuthor({
        name: message.author.tag,
        iconURL: message.author.displayAvatarURL({ dynamic: true })
      })
      .setTitle('معلومات المستوى')
      .setThumbnail(message.author.displayAvatarURL({ dynamic: true }))
      .setDescription(
        `**${message.author.username}**, هذه هي تفاصيل مستواك الحالية:\n\n` +
        `**Level الحالي:** \`${UDB.level}\`\n` +
        `**XP الحالي:** \`${UDB.xp} / ${Lxp}\`\n\n` +
        `**التقدم:**\n${XP}`
      )
      .addFields(
        { name: '🏆 المستوى القادم', value: `${UDB.level + 1}`, inline: true },
        { name: '💠 الـ XP المطلوب للترقية', value: `${Lxp - UDB.xp}`, inline: true }
      )
      .setFooter({ text: `تم آخر تحديث`, iconURL: client.user.displayAvatarURL() })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith(prefix + "channel-levelup")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('ليس لديك صلاحية لاستخدام هذا الأمر');
    const Input = message.content.slice((prefix + "channel-levelup").length).trim().split(/ +/);
    if (!Input.length) return message.reply('اكتب `default` أو منشن/اكتب ID الروم');

    let channel = message.guild.channels.cache.get(Input[0]) || message.mentions.channels.first();
    let GDB = await GuildConfig.findOne({ guildID: message.guild.id });
    if (!GDB) GDB = new GuildConfig({ guildID: message.guild.id });

    if (Input[0].toLowerCase() === "default") {
      GDB.levelUpChannel = "Default";
      await GDB.save();
      return message.reply('تم تعيين الإشعارات للوضع الافتراضي');
    }

    if (!channel) return message.reply('الروم غير موجود');
    const perms = channel.permissionsFor(message.guild.members.me);
    if (!perms.has(PermissionsBitField.Flags.SendMessages) || !perms.has(PermissionsBitField.Flags.ViewChannel))
      return message.reply(`لا أملك صلاحيات كافية لإرسال الرسائل في ${channel}`);

    GDB.levelUpChannel = channel.id;
    await GDB.save();
    message.reply(`تم تعيين روم الإشعارات إلى ${channel}`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith(prefix + "blacklist-add")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('ليس لديك صلاحية لاستخدام هذا الأمر');
    }

    const Input = message.content.slice((prefix + "blacklist-add").length).trim().split(/ +/);
    if (!Input.length) return message.reply("يرجى منشن مستخدم أو روم أو إدخال الـID");

    const User = message.mentions.members.first() || message.guild.members.cache.get(Input[0]);
    const Channel = message.mentions.channels.first() || message.guild.channels.cache.get(Input[0]);

    if (!User && !Channel) {
      return message.reply("لم يتم العثور على مستخدم أو روم بهذا المعرف");
    }

    const type = User ? "User" : "Channel";
    const MID = User ? User.id : Channel.id;
    const Name = User ? User.toString() : Channel.toString();

    const exists = await Blacklist.findOne({
      guildID: message.guild.id,
      type: type,
      MID: MID
    });

    if (exists) {
      return message.reply(`هذا ${type === "User" ? "المستخدم" : "الروم"} موجود بالفعل في البلاك ليست`);
    }

    await new Blacklist({
      guildID: message.guild.id,
      type: type,
      MID: MID
    }).save();

    return message.reply(`تمت إضافة ${Name} إلى البلاك ليست`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith(prefix + "blacklist-remove")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
      return message.reply('ليس لديك صلاحية لاستخدام هذا الأمر');
    }

    const Input = message.content.slice((prefix + "blacklist-remove").length).trim().split(/ +/);
    if (!Input.length) return message.reply("يرجى منشن مستخدم أو روم أو إدخال الـID");

    const User = message.mentions.members.first() || message.guild.members.cache.get(Input[0]);
    const Channel = message.mentions.channels.first() || message.guild.channels.cache.get(Input[0]);

    if (!User && !Channel) {
      return message.reply("لم يتم العثور على مستخدم أو روم بهذا المعرف");
    }

    const type = User ? "User" : "Channel";
    const MID = User ? User.id : Channel.id;
    const Name = User ? User.toString() : Channel.toString();

    const exists = await Blacklist.findOne({
      guildID: message.guild.id,
      type: type,
      MID: MID
    });

    if (!exists) {
      return message.reply(`هذا ${type === "User" ? "المستخدم" : "الروم"} غير موجود في البلاك ليست`);
    }

    await Blacklist.deleteOne({
      guildID: message.guild.id,
      type: type,
      MID: MID
    });

    return message.reply(`تمت إزالة ${Name} من البلاك ليست`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  if (message.content.startsWith(prefix + "blacklist-list")) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) return message.reply('ليس لديك صلاحية لاستخدام هذا الأمر');
    const list = await Blacklist.find({ guildID: message.guild.id });
    if (!list.length) return message.reply("البلاك ليست فارغة");

    const users = list.filter(i => i.type === "User").map(i => `<@${i.MID}>`).join(", ") || "لا يوجد مستخدمين";
    const channels = list.filter(i => i.type === "Channel").map(i => `<#${i.MID}>`).join(", ") || "لا يوجد رومات";
    return message.reply(`**المستخدمين:** ${users}\n**الرومات:** ${channels}`);
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  if (!message.content.startsWith(prefix + "reset-level")) return;
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
    return message.reply("ليس لديك صلاحية لاستخدام هذا الأمر");
  }

  const Input = message.content.slice((prefix + "reset-level").length).trim().split(/ +/);
  const User = message.mentions.members.first() || message.guild.members.cache.get(Input[0]);

  if (!User) {
    return message.reply("يرجى منشن المستخدم أو وضع ID صحيح");
  }

  let UDB = await Level.findOne({ userID: User.id, guildID: message.guild.id });
  if (!UDB) {
    return message.reply("هذا المستخدم لا يمتلك أي بيانات لفل");
  }

  UDB.level = 1;
  UDB.xp = 0;
  await UDB.save();

  try {
    const cleanName = User.displayName.replace(/ 🔥 \d+$/, "");
    await User.setNickname(cleanName).catch(() => { });
  } catch (err) {
    console.error(`خطأ أثناء إعادة الاسم:`, err.message);
  }

  const embed = new EmbedBuilder()
    .setColor('#ff0000')
    .setTitle('تصفير لفل')
    .setDescription(`تم تصفير مستوى <@${User.id}> بنجاح`)
    .addFields(
      { name: '👤 المستخدم', value: `${User.user.tag}`, inline: true },
      { name: '🔹 المستوى الآن', value: `1`, inline: true },
      { name: '💠 XP الآن', value: `0`, inline: true }
    )
    .setFooter({ text: `تم التنفيذ بواسطة ${message.author.tag}`, iconURL: message.author.displayAvatarURL() })
    .setTimestamp();

  return message.reply({ embeds: [embed] });
});

client.login(config.token);
