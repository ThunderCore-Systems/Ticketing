import { 
  Client, 
  GatewayIntentBits, 
  TextChannel, 
  ApplicationCommandType,
  ApplicationCommandOptionType,
  REST,
  Routes,
  type ChatInputCommandInteraction
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
      if (!interaction.isChatInputCommand()) return;

      if (interaction.commandName === 'ticket') {
        await handleTicketCommand(interaction);
      }
    });

    // Login in a non-blocking way
    client.login(process.env.DISCORD_BOT_TOKEN).catch((error) => {
      console.error('Failed to login to Discord:', error);
      client = null; // Reset client on failure
    });

    // Don't wait for bot initialization to complete
    return;
  } catch (error) {
    console.error('Error in Discord bot setup:', error);
    client = null;
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