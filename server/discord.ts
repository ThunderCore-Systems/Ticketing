import { 
  Client, 
  GatewayIntentBits, 
  TextChannel, 
  CategoryChannel,
  ApplicationCommandType,
  ApplicationCommandOptionType,
  REST,
  Routes,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  EmbedBuilder,
  ChannelType,
  type ChatInputCommandInteraction,
  type ButtonInteraction
} from "discord.js";
import type { Server } from "http";
import { storage } from "./storage";

let client: Client | null = null;

const commands = [
  {
    name: 'ticket',
    type: ApplicationCommandType.ChatInput,
    description: 'Create a new support ticket',
    options: [
      {
        name: 'title',
        type: ApplicationCommandOptionType.String,
        description: 'The title of your ticket',
        required: true,
      }
    ],
  }
];

export async function setupDiscordBot(server: Server) {
  try {
    console.log('Starting Discord bot initialization...');

    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
      ],
    });

    client.once("ready", async () => {
      console.log(`Discord bot successfully logged in as ${client?.user?.tag}`);

      // Register slash commands
      try {
        if (!client?.user) throw new Error("Client user is not defined");

        console.log('Registering slash commands...');
        const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN!);
        await rest.put(
          Routes.applicationCommands(client.user.id),
          { body: commands }
        );
        console.log('Successfully registered slash commands');
      } catch (error) {
        console.error('Error registering slash commands:', error);
      }
    });

    client.on("interactionCreate", async (interaction) => {
      if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
      } else if (interaction.isChatInputCommand()) {
        if (interaction.commandName === 'ticket') {
          await handleTicketCommand(interaction);
        }
      }
    });

    // Login in a non-blocking way
    client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
      console.error('Failed to login to Discord:', error);
      client = null;
    });

    return;
  } catch (error) {
    console.error('Error in Discord bot setup:', error);
    client = null;
  }
}

async function handleButtonInteraction(interaction: ButtonInteraction) {
  if (!interaction.customId.startsWith('ticket_')) return;

  const [action, panelId, ...args] = interaction.customId.split('_');

  try {
    const panel = await storage.getPanel(parseInt(panelId));
    if (!panel) {
      await interaction.reply({
        content: 'This ticket panel no longer exists.',
        ephemeral: true
      });
      return;
    }

    switch (action) {
      case 'create':
        await createTicketChannel(interaction, panel);
        break;
      case 'close':
        await closeTicket(interaction, args[0]);
        break;
      case 'claim':
        await claimTicket(interaction, args[0]);
        break;
    }
  } catch (error) {
    console.error('Error handling button interaction:', error);
    await interaction.reply({
      content: 'There was an error processing your request.',
      ephemeral: true
    });
  }
}

async function createTicketChannel(interaction: ButtonInteraction, panel: any) {
  try {
    const ticketNumber = await getNextTicketNumber(panel.prefix);
    const ticketName = `${panel.prefix}-${ticketNumber}`;

    const channel = await interaction.guild?.channels.create({
      name: ticketName.toLowerCase(),
      type: ChannelType.GuildText,
      parent: panel.categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild!.id,
          deny: ['ViewChannel'],
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
        {
          id: panel.supportRoleId,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'],
        },
      ],
    });

    if (channel) {
      const ticket = await storage.createTicket({
        panelId: panel.id,
        channelId: channel.id,
        userId: interaction.user.id,
        number: ticketNumber,
        status: 'open',
      });

      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${ticketName}`)
        .setDescription('Support ticket created')
        .addFields(
          { name: 'Created by', value: `<@${interaction.user.id}>` },
          { name: 'Support Team', value: `<@&${panel.supportRoleId}>` }
        )
        .setColor(0x00ff00);

      const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`ticket_claim_${ticket.id}`)
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`ticket_close_${ticket.id}`)
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger)
        );

      await channel.send({
        content: `<@${interaction.user.id}> <@&${panel.supportRoleId}>`,
        embeds: [embed],
        components: [buttons],
      });

      await interaction.reply({
        content: `Ticket created! Check ${channel}`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error creating ticket channel:', error);
    await interaction.reply({
      content: 'Failed to create ticket channel. Please try again.',
      ephemeral: true
    });
  }
}

async function createTicketPanel(
  guildId: string,
  channelId: string,
  panel: {
    title: string;
    description: string;
    prefix: string;
    categoryId: string;
    supportRoleId: string;
  }
) {
  if (!client) throw new Error('Discord bot is not initialized');

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || !(channel instanceof TextChannel)) {
      throw new Error('Invalid channel');
    }

    const embed = new EmbedBuilder()
      .setTitle(panel.title)
      .setDescription(panel.description)
      .addFields(
        { name: 'Support Team', value: `<@&${panel.supportRoleId}>` },
        { name: 'Ticket Format', value: `${panel.prefix}-NUMBER` }
      )
      .setColor(0x0099ff);

    const button = new ActionRowBuilder<ButtonBuilder>()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_create_${panel.prefix}`)
          .setLabel('Create Ticket')
          .setStyle(ButtonStyle.Primary)
      );

    await channel.send({
      embeds: [embed],
      components: [button],
    });
  } catch (error) {
    console.error('Error creating ticket panel:', error);
    throw error;
  }
}

export async function getServerChannels(guildId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  return channels
    .filter(channel => channel?.type === ChannelType.GuildText)
    .map(channel => ({
      id: channel!.id,
      name: channel!.name,
      type: channel!.type,
    }));
}

export async function getServerCategories(guildId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  const guild = await client.guilds.fetch(guildId);
  const channels = await guild.channels.fetch();

  return channels
    .filter(channel => channel?.type === ChannelType.GuildCategory)
    .map(channel => ({
      id: channel!.id,
      name: channel!.name,
      type: channel!.type,
    }));
}

export async function getServerRoles(guildId: string) {
  if (!client) throw new Error('Discord bot is not initialized');

  const guild = await client.guilds.fetch(guildId);
  const roles = await guild.roles.fetch();

  return roles.map(role => ({
    id: role.id,
    name: role.name,
  }));
}

async function getNextTicketNumber(prefix: string): Promise<number> {
  const tickets = await storage.getTicketsByPrefix(prefix);
  const numbers = tickets.map(t => t.number);
  const maxNumber = Math.max(0, ...numbers);
  return maxNumber + 1;
}

async function closeTicket(interaction: ButtonInteraction, ticketId: string) {
  try {
    const ticket = await storage.getTicket(parseInt(ticketId));
    if (!ticket) {
      await interaction.reply({
        content: 'This ticket no longer exists.',
        ephemeral: true
      });
      return;
    }

    await storage.updateTicket(ticket.id, {
      status: 'closed',
    });

    const channel = interaction.channel as TextChannel;
    await channel.send({
      content: `Ticket closed by <@${interaction.user.id}>`,
    });

    // Archive the channel
    await channel.setArchived(true);

    await interaction.reply({
      content: 'Ticket has been closed.',
      ephemeral: true
    });
  } catch (error) {
    console.error('Error closing ticket:', error);
    await interaction.reply({
      content: 'Failed to close ticket. Please try again.',
      ephemeral: true
    });
  }
}

async function claimTicket(interaction: ButtonInteraction, ticketId: string) {
  try {
    const ticket = await storage.getTicket(parseInt(ticketId));
    if (!ticket) {
      await interaction.reply({
        content: 'This ticket no longer exists.',
        ephemeral: true
      });
      return;
    }

    await storage.updateTicket(ticket.id, {
      claimedBy: interaction.user.id,
    });

    await interaction.reply({
      content: `Ticket claimed by <@${interaction.user.id}>`,
    });
  } catch (error) {
    console.error('Error claiming ticket:', error);
    await interaction.reply({
      content: 'Failed to claim ticket. Please try again.',
      ephemeral: true
    });
  }
}

async function handleTicketCommand(interaction: ChatInputCommandInteraction) {
  if (!client) {
    await interaction.reply({
      content: 'The bot is currently unavailable. Please try again later.',
      ephemeral: true
    });
    return;
  }

  try {
    const title = interaction.options.getString('title', true);
    const server = await storage.getServerByDiscordId(interaction.guildId!);

    if (!server) {
      await interaction.reply({
        content: "This server is not registered! Please register through the dashboard first.",
        ephemeral: true
      });
      return;
    }

    // Check subscription status
    if (!server.subscriptionStatus || server.subscriptionStatus !== 'active') {
      await interaction.reply({
        content: "This server needs an active subscription to create tickets. Please visit the dashboard to subscribe.",
        ephemeral: true
      });
      return;
    }

    const ticket = await storage.createTicket({
      serverId: server.id,
      userId: null, // Will be updated when we implement user linking
      title,
      status: "open",
    });

    // Create Discord channel for ticket
    const channel = await interaction.guild?.channels.create({
      name: `ticket-${ticket.id}`,
      topic: title,
      reason: `Ticket created by ${interaction.user.tag}`
    });

    if (channel && channel instanceof TextChannel) {
      await storage.updateTicket(ticket.id, {
        discordChannelId: channel.id,
      });

      await channel.send({
        content: `Ticket created by ${interaction.user.tag}\n**${title}**\nUse the dashboard to manage this ticket.`,
      });

      await interaction.reply({
        content: `Ticket created! Check ${channel}`,
        ephemeral: true
      });
    }
  } catch (error) {
    console.error('Error handling ticket command:', error);
    await interaction.reply({
      content: 'There was an error creating your ticket. Please try again later.',
      ephemeral: true
    });
  }
}

export async function closeTicketChannel(channelId: string) {
  if (!client) {
    console.error('Cannot close ticket channel: Discord bot is not initialized');
    return;
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (channel && channel instanceof TextChannel) {
      await channel.delete();
    }
  } catch (error) {
    console.error('Error closing ticket channel:', error);
  }
}