#include <dlfcn.h>
#include <stdio.h>
int main(int argc,char**argv){if(argc!=2)return 2;void*p=dlopen(argv[1],RTLD_NOW);if(!p){fprintf(stderr,"LOAD_FAILED: %s\n",dlerror());return 1;}printf("LOAD_OK execute_command=%s\n",dlsym(p,"execute_command")?"present":"missing");return 0;}
