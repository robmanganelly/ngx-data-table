# Main Directive

These are the main directives we will follow for the implementation of this library.

- **Design the API emulating angular signal forms and ngrx signal store. Take of each the parts that make sense for the context of our library.**
  This helps to build the API in a way that is easy and idiomatic for angular devs.
- **Not exposing a single 'createTable' entry point. Expose instead a set of 'factories/builders' that return a table coordinator optimized for a specific use case (simple table, vs grouped table, vs expandable table)**
  This helps with tree shaking and modularizing the library, we then can 'customize' each coordinator using features api, similar to how ngrx signal store works.
  What makes it a feature or a new coordinator is based on the answer to the question 'does every table, independent of use case, need this feature? i.e. pagination is a feature, hiding columns is a feature, but expandable table or tree table are new coordinators' The difference is still somewhat arbitrary, but it's a useful distinction.
  The purpose of the factories is to help keeping boilerplate at a minimum, and to help with tree shaking.
