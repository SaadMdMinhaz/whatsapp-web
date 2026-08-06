IF DB_ID('whatsapp_auth') IS NULL
BEGIN
    CREATE DATABASE whatsapp_auth;
END;
GO

IF DB_ID('whatsapp_users') IS NULL
BEGIN
    CREATE DATABASE whatsapp_users;
END;
GO

IF DB_ID('whatsapp_chat') IS NULL
BEGIN
    CREATE DATABASE whatsapp_chat;
END;
GO

IF DB_ID('whatsapp_media') IS NULL
BEGIN
    CREATE DATABASE whatsapp_media;
END;
GO
