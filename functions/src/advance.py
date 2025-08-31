# We still need our first function
def print_lyrics():
  print("I'm a lumberjack, and I'm okay.")
  print("I sleep all night and I work all day.")

# Here's our new function that calls the first one... twice!
def repeat_lyrics():
  print_lyrics()
  print_lyrics()

# Now, we call our NEW function to start everything
repeat_lyrics()