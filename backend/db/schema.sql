-- Family Call App - Database Schema
-- Run this file to create the database and tables

CREATE DATABASE IF NOT EXISTS family_call_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE family_call_db;

-- Users table: stores name + profile picture
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  avatar_path VARCHAR(255) DEFAULT NULL,
  socket_id VARCHAR(100) DEFAULT NULL,
  status ENUM('online', 'offline', 'in_call') DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Call logs table: optional history of calls
CREATE TABLE IF NOT EXISTS call_logs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  caller_id INT NOT NULL,
  receiver_id INT NOT NULL,
  status ENUM('completed', 'missed', 'rejected', 'cancelled') DEFAULT 'missed',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ended_at TIMESTAMP NULL DEFAULT NULL,
  FOREIGN KEY (caller_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
);
