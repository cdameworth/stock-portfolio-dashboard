#!/usr/bin/env node
'use strict';

/**
 * Simple database migration runner
 * Connects to the existing PostgreSQL database and runs migrations
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Database configuration from environment variables
const dbConfig = {
  host: process.env.DB_HOST,
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: {
    rejectUnauthorized: false
  }
};

async function runMigrations() {
  console.log('🚀 Starting database migrations...');
  console.log(`📍 Connecting to: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
  
  if (!dbConfig.host || !dbConfig.database || !dbConfig.user || !dbConfig.password) {
    console.error('❌ Missing database configuration. Please set DB_HOST, DB_NAME, DB_USER, and DB_PASSWORD environment variables.');
    process.exit(1);
  }

  const pool = new Pool(dbConfig);

  try {
    // Test connection
    const client = await pool.connect();
    console.log('✅ Database connection established');
    
    // Check current database
    const { rows } = await client.query('SELECT current_database(), current_user, version()');
    console.log(`📊 Connected to database: ${rows[0].current_database}`);
    console.log(`👤 Connected as user: ${rows[0].current_user}`);
    console.log(`🐘 PostgreSQL version: ${rows[0].version.split(' ')[0]} ${rows[0].version.split(' ')[1]}`);
    
    client.release();

    // Create migrations tracking table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS migrations (
        id SERIAL PRIMARY KEY,
        filename VARCHAR(255) UNIQUE NOT NULL,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, '../database/migrations');
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.sql'))
      .sort();

    console.log(`📁 Found ${migrationFiles.length} migration files`);

    for (const filename of migrationFiles) {
      // Check if migration was already executed
      const { rows: existingRows } = await pool.query(
        'SELECT id FROM migrations WHERE filename = $1',
        [filename]
      );

      if (existingRows.length > 0) {
        console.log(`⏭️  Skipping ${filename} (already executed)`);
        continue;
      }

      console.log(`🔄 Running migration: ${filename}`);
      
      // Read and execute migration file
      const migrationPath = path.join(migrationsDir, filename);
      const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        // Execute migration in a transaction
        await pool.query('BEGIN');

        // Execute the entire migration as a single statement
        // This properly handles complex SQL with DO blocks, JSON, etc.
        await pool.query(migrationSQL);

        // Record successful migration
        await pool.query(
          'INSERT INTO migrations (filename) VALUES ($1)',
          [filename]
        );

        await pool.query('COMMIT');
        console.log(`✅ Successfully executed: ${filename}`);
        
      } catch (error) {
        await pool.query('ROLLBACK');
        console.error(`❌ Error executing ${filename}:`, error.message);
        throw error;
      }
    }

    // Show final status
    console.log('\n📊 Migration summary:');
    const { rows: migrationRows } = await pool.query(`
      SELECT 
        filename, 
        executed_at,
        EXTRACT(EPOCH FROM (NOW() - executed_at)) as seconds_ago
      FROM migrations 
      ORDER BY executed_at DESC 
      LIMIT 10
    `);

    migrationRows.forEach(row => {
      const timeAgo = row.seconds_ago < 60 ? 'just now' : `${Math.floor(row.seconds_ago / 60)} minutes ago`;
      console.log(`  📄 ${row.filename} - ${timeAgo}`);
    });

    // Show table status
    console.log('\n📋 Database tables:');
    const { rows: tableRows } = await pool.query(`
      SELECT 
        tablename,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `);

    tableRows.forEach(row => {
      console.log(`  📊 ${row.tablename} (${row.size})`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🎉 Migrations completed successfully!');
  }
}

if (require.main === module) {
  runMigrations();
}

module.exports = { runMigrations };