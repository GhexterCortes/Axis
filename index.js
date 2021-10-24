/**    ###      ##     ##   ######     ######  
      ## ##      ##   ##      ##     ##    ## 
     ##   ##      ## ##       ##     ##       
    ##     ##      ###        ##      ######  
    #########     ## ##       ##           ## 
    ##     ##    ##   ##      ##     ##    ## 
    ##     ##   ##     ##   ######    ######  
**/

require('./scripts/startup')();

// Modules
const Util = require('fallout-utility');
const Fs = require('fs');
const Path = require('path');
const Config = require('./scripts/config');
const Language = require('./scripts/language');
const Discord = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v9');

const log = Util.logger;
    log.defaultPrefix = 'Bot';
const parseConfig = new Config();
    parseConfig.location = './config/config.yml';
    parseConfig.parse();
    parseConfig.testmode();
    parseConfig.prefill();
let config = parseConfig.config;
const language = new Language();
    language.location = config.language;
    language.parse();
let lang = language.language;

const Client = new Discord.Client({
    intents: [
        Discord.Intents.FLAGS.GUILDS,
        Discord.Intents.FLAGS.GUILD_INTEGRATIONS,
        Discord.Intents.FLAGS.GUILD_BANS,
        Discord.Intents.FLAGS.GUILD_MEMBERS,
        Discord.Intents.FLAGS.GUILD_MESSAGES,
        Discord.Intents.FLAGS.GUILD_PRESENCES
    ]
});

Client.login(config.token);
const Actions = new actions();

var modulesList = {};
var scripts = {};

var commands = [];
Client.commands = new Discord.Collection();

// Load scripts
Actions.loadScripts();

// Client ready
Client.on('ready', function() {
    log.warn('Client connected!', 'Status');
    log.warn(`\nInvite: ${ Actions.createInvite(Client) }\n`, 'Invite');

    // Register commands
    Actions.registerInteractionCommmands(Client);

    // On Interaction commands
    Client.on('interactionCreate', async (interaction) => {
        if(!interaction.isCommand()) return;

        const command = Client.commands.get(interaction.commandName);
        if (!command) return;

        log.warn(interaction.member.user.username + ' executed ' + interaction.commandName, 'Slash command');
        try {
            await command.execute(interaction, Client, Actions);
        } catch (err) {
            log.error(err, 'Interaction');
        }
    });

    // On Message
    Client.on('messageCreate', async (message) => {
        if(message.author.id === Client.user.id || message.author.bot || message.author.system) return;
        log.log(message.author.username + ': ' + message.content, 'Message');

        // Message commands
        if(Util.detectCommand(message.content, config.commandPrefix)){
            const commandConstructor = Util.getCommand(message.content, config.commandPrefix);
            const command = commandConstructor.command.toLowerCase();

            // Ignored channels
            if(
                config.blacklistChannels.enabled && !config.blacklistChannels.convertToWhitelist && config.blacklistChannels.channels.includes(message.channelId.toString())
                || 
                config.blacklistChannels.enabled && config.blacklistChannels.convertToWhitelist && !config.blacklistChannels.channels.includes(message.channelId.toString())
            ) return;

            // Execute command
            if(scripts.hasOwnProperty(command)){
                Actions.messageCommand(command, message);
            }
        }
    });
});

function actions() {
    // scripts
    this.reload = (message, interaction) => {
        parseConfig.parse();
        config = parseConfig.config;
    
        language.parse();
        lang = language.language;

        // re-login to client
        Client.login(config.token).then(function () {
            if(typeof message !== 'undefined') Actions.messageReply(message, language.get(lang.reload.success));
            if(typeof interaction !== 'undefined') interaction.reply(language.get(lang.reload.success));
        }).catch(err => {
            log.error(err, 'Reload');
            if(typeof message !== 'undefined') Actions.messageReply(message, language.get(lang.error) + '\n```\n' + err.message + '\n```');
            if(typeof interaction !== 'undefined') interaction.reply(language.get(lang.reload.error));
        });

        Actions.loadScripts();
        return {
            language: lang,
            config: config
        };
    }
    this.loadScripts = () => {
        scripts = {};
        modulesList = Fs.readdirSync(__dirname + '/modules/').filter(file => file.endsWith('.js'));

        // Require scripts
        for (const file of modulesList) {
            let name = Path.parse(file).name;
            let path = __dirname + '/modules/' + file;
            
            // Clear cache from previous script
            if(Object.keys(require.cache).find(module => module == path)) delete require.cache[path];
            let importModule = require(path);
            
            try {
                // Replace whitespace
                name = Util.replaceAll(name, ' ', '_').toLowerCase();

                // Check supported version
                if(!importModule.versions || importModule.versions && !importModule.versions.find(version => version == config.version)) { log.error(`${file} does not support bot version ${config.version}`, file); continue; }

                // Import script
                scripts[name] = importModule;
                if(scripts[name].start(Client, Actions, config, lang)) log.log(`Script ${name} ready!`, file);

                // Slash commands
                if(typeof scripts[name]['slash'] != 'undefined') {
                    let slash = scripts[name]['slash'];

                    commands.push(slash['command'].toJSON());
                    Client.commands.set(slash['command']['name'], slash);
                }
            } catch (err) {
                log.error(`Coudln't load ${file}: ${err.message}`, file);
                log.error(err, file);
            }
        }
    }

    // Commands
    this.messageCommand = (command, message) => {
        const args = Util.getCommand(message.content.trim(), config.commandPrefix).args;

        log.warn(message.author.username + ' executed ' + command, 'message Command');

        if(config.adminOnlyCommands.find(key => key.toLowerCase() == command) && !this.admin(message.member)) { 
            this.reply(message, language.get(lang.noPerms)); return; 
        }
        if(config.moderatorOnlyCommands.find(key => key.toLowerCase() == command) && !this.moderator(message.member)) { 
            this.reply(message, language.get(lang.noPerms)); return; 
        }
        if(typeof scripts[command].execute === 'undefined') { log.warn(command + ' is not a command'); return; } 

        scripts[command].execute(args, message, Actions, Client).catch(async err => {
            log.error(err, command + '.js');
            await this.send(message.channel, language.get(lang.error) + '\n```\n' + err.message + '\n```');
        });
    }
    this.registerInteractionCommmands = async (client) => {
        const rest = new REST({ version: '9' }).setToken(config.token);

        try {
            await rest.put(
                Routes.applicationCommands(client.user.id),
                { body: commands },
            );            
            log.warn(`${ Object.keys(commands).length } application commands were successfully registered on a global scale.`, 'Register Commands');
        } catch (err) {
            log.error(err, 'Register Commands');
        }
    }

    // Other utility functions
    this.get = (object) => {
        return language.get(object);
    }
    this.createInvite = (bot) => {
        return Util.replaceAll(config.inviteFormat, '%id%', bot.user.id);
    }
    
    // Permissions
    this.admin = (member) => {
        if(member && member.permissions.has(Discord.Permissions.FLAGS.ADMINISTRATOR)) return true;
        return false;
    }
    this.moderator = (member) => {
        if(member && member.permissions.has([Discord.Permissions.FLAGS.BAN_MEMBERS, Discord.Permissions.FLAGS.KICK_MEMBERS])) return true;
        return false;
    }

    // Safe execute
    this.messageSend = async (channel, message) => {
        try {
            return await channel.send(message).catch(err => { log.error(err, 'Send error'); });
        } catch (err) {
            log.error(err, 'Send error');
            return false;
        }
    }
    this.messageReply = async (message, reply) => {
        try {
            return await message.reply(reply).catch(err => { log.error(err, 'Reply error'); });
        } catch (err) {
            log.error(err, 'Reply error');
            return false;
        }
    }
    this.messageDelete = async (message) => {
        try {
            return await message.delete().catch( err => { log.error(err, 'Delete error'); });
        } catch (err) {
            log.error(err, 'Delete error');
        }
    }
    this.messageReact = async (message, reaction) => {
        try {
            return await message.react(reaction).catch( err => { log.error(err, 'Reaction error'); });
        } catch (err) {
            log.error(err, 'Reaction error');
            return false;
        }
    }
}