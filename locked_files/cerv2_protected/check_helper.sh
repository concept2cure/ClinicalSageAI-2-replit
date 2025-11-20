# Function to check file integrity with caching
check_integrity() {
  SOURCE_FILE=$1
  CHECKSUM_FILE=$2
  CACHE_FILE=$3
  
  # Check if cache exists and is recent
  if [ -f "$CACHE_FILE" ]; then
    CACHE_TIME=$(cut -d'|' -f1 "$CACHE_FILE")
    CACHE_RESULT=$(cut -d'|' -f2 "$CACHE_FILE")
    
    # If cache is recent (5 minutes), use it
    if [ $(($(date +%s) - CACHE_TIME)) -lt 300 ]; then
      if [ "$CACHE_RESULT" = "valid" ]; then
        echo "cached_valid"
        return 0
      else
        echo "cached_invalid"
        return 1
      fi
    fi
  fi
  
  # Calculate current check
  if [ -f "$SOURCE_FILE" ] && [ -f "$CHECKSUM_FILE" ]; then
    CURRENT_MD5=$(md5sum "$SOURCE_FILE" | awk '{ print $1 }')
    STORED_MD5=$(cat "$CHECKSUM_FILE" | awk '{ print $1 }')
    
    if [ "$CURRENT_MD5" = "$STORED_MD5" ]; then
      echo "$(date +%s)|valid" > "$CACHE_FILE"
      echo "valid"
      return 0
    else
      echo "$(date +%s)|invalid" > "$CACHE_FILE"
      echo "invalid"
      return 1
    fi
  else
    echo "missing"
    return 2
  fi
}
