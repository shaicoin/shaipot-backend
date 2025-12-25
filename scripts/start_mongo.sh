#!/bin/bash

# Variables
MONGO_VERSION="8.0.0"
MONGO_DIR="./mongodb"
MONGO_BIN="$MONGO_DIR/bin/mongod"
DATA_DIR="$MONGO_DIR/data/db"

# Function to download MongoDB
download_mongodb() {
    echo "Downloading MongoDB $MONGO_VERSION..."

    if [[ "$OSTYPE" == "darwin"* ]]; then
        # macOS
        DOWNLOAD_URL="https://fastdl.mongodb.org/osx/mongodb-macos-x86_64-$MONGO_VERSION.tgz"
    elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
        # Detect Ubuntu version
        UBUNTU_VERSION=$(lsb_release -rs)
        case $UBUNTU_VERSION in
    	"20.04")
        	DOWNLOAD_URL="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2004-$MONGO_VERSION.tgz"
        	;;
    	"22.04")
        	DOWNLOAD_URL="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2204-$MONGO_VERSION.tgz"
       		;;
    	"24.04"|"24.10")
        	DOWNLOAD_URL="https://fastdl.mongodb.org/linux/mongodb-linux-x86_64-ubuntu2404-$MONGO_VERSION.tgz"
       		;;
    	*)
        	echo "Unsupported Ubuntu version: $UBUNTU_VERSION"
        	exit 1
        	;;
	esac

    else
        echo "Unsupported OS"
        exit 1
    fi

    curl -o mongodb.tgz $DOWNLOAD_URL
    mkdir -p $MONGO_DIR
    tar -zxvf mongodb.tgz -C $MONGO_DIR --strip-components=1
    rm mongodb.tgz
    echo "MongoDB downloaded and extracted to $MONGO_DIR"
}

# Check if MongoDB is installed locally
if [ ! -f "$MONGO_BIN" ]; then
    download_mongodb
else
    echo "MongoDB is already installed locally."
fi

# Create data directory if it doesn't exist
mkdir -p $DATA_DIR

# Start MongoDB
echo "Starting MongoDB..."
$MONGO_BIN --dbpath $DATA_DIR --logpath "$MONGO_DIR/mongodb.log"

# Check if MongoDB started successfully
if [ $? -eq 0 ]; then
    echo "MongoDB started successfully!"
else
    echo "Failed to start MongoDB."
    exit 1
fi

