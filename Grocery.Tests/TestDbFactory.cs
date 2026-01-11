//using Grocery.Api.Data;
//using Microsoft.Data.Sqlite;
//using Microsoft.EntityFrameworkCore;
//using System;
//using System.Collections.Generic;
//using System.Linq;
//using System.Text;
//using System.Threading.Tasks;

//namespace Grocery.Tests
//{
//    public static class TestDbFactory
//    {
//        public static (StoreDbContext db, SqliteConnection conn) CreateContext()
//        {
//            var conn = new SqliteConnection("DataSource=:memory:");
//            conn.Open(); // keep open for lifetime of the context

//            var options = new DbContextOptionsBuilder<StoreDbContext>()
//                .UseSqlite(conn)
//                .EnableSensitiveDataLogging()
//                .Options;

//            var db = new StoreDbContext(options);
//            db.Database.EnsureCreated();  // build schema from your model

//            return (db, conn);
//        }
//    }
//}
